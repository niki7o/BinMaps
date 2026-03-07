using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;

namespace BinMaps.Infrastructure.Services;

public sealed class ReportService : IReportService
{
    private const double AiWeight                  = 0.6;
    private const double ReputationWeight          = 0.4;
    private const double AutoApproveThreshold      = 85.0;
    private const int    AutoRejectBelowReputation = 25;

    private readonly IRepository<Report, int>  _reportRepo;
    private readonly IAIService                _aiService;
    private readonly IReputationService        _reputationService;
    private readonly IContainerUpdateService   _containerUpdateService;
    private readonly UserManager<User>         _userManager;
    private readonly IHubContext<ContainerHub> _hub;

    #region Constructor

    public ReportService(
        IRepository<Report, int>  reportRepo,
        IAIService                aiService,
        IReputationService        reputationService,
        IContainerUpdateService   containerUpdateService,
        UserManager<User>         userManager,
        IHubContext<ContainerHub> hub)
    {
        _reportRepo             = reportRepo;
        _aiService              = aiService;
        _reputationService      = reputationService;
        _containerUpdateService = containerUpdateService;
        _userManager            = userManager;
        _hub                    = hub;
    }

    #endregion

    #region Public

    public async Task<ReportResponseDto> CreateAsync(
        CreateReportDTO dto,
        string userId,
        string userName,
        string role,
        AIResultDto? precomputedAiResult = null)
    {
        var dbUser         = await _userManager.FindByIdAsync(userId);
        var userReputation = dbUser?.Reputation ?? GetReputationFromRole(role);

        var hasPhoto      = dto.Photo is not null || precomputedAiResult is not null;
        var isAdmin       = role == "Admin";
        var isDriver      = role == "Driver";
        var isTruckReport = dto.ReportType == ReportType.TruckProblem;

        // AI is only meaningful for visual (photo-based) fill/fire reports.
        // SensorBroken, ContainerDamage (Offline), and TruckProblem are not assessed
        // by visual AI — the photo is stored for reference only, never analyzed.
        var isAiApplicable = dto.ReportType == ReportType.Full ||
                             dto.ReportType == ReportType.Fire;

        // Use precomputed AI result from controller (photo stream was fresh there),
        // or fall back to calling AI here if no precomputed result was supplied.
        AIResultDto? aiResult = precomputedAiResult;
        if (aiResult is null && dto.Photo is not null && isAiApplicable)
            aiResult = await _aiService.AnalyzeAsync(dto.Photo!);

        var aiScore           = aiResult?.Confidence       ?? 0.0;
        var containerDetected = aiResult?.ContainerDetected ?? true;  // true when no photo

        // Drivers do not participate in the reputation formula — their score is
        // determined by the AI alone.  Regular users keep the weighted blend.
        var finalConfidence = isDriver
            ? aiScore
            : CalculateConfidence(aiScore, userReputation, hasPhoto);

        // ── Auto-approve rules ────────────────────────────────────────────────
        bool autoApprove;
        if (isAdmin)
        {
            // Admins always auto-approve.
            autoApprove = true;
        }
        else if (isDriver)
        {
            bool aiVeryLow = hasPhoto && aiScore > 0 && aiScore < 20.0;
            autoApprove = !aiVeryLow;
        }
        else
        {
            bool photoPresentButNoBin = hasPhoto && aiResult is not null && !containerDetected;
            bool isSensorBroken       = dto.ReportType == ReportType.SensorBroken;
            bool isPhotoVerifiable    = dto.ReportType == ReportType.Full ||
                                        dto.ReportType == ReportType.Fire;
            bool highConfidence       = finalConfidence >= AutoApproveThreshold;

            autoApprove = !photoPresentButNoBin &&
                          (isSensorBroken || (isPhotoVerifiable && highConfidence));
        }

        var report = new Report
        {
            UserId                 = userId,
            UserName               = userName,
            TrashContainerId       = dto.TrashContainerId > 0 ? dto.TrashContainerId : null,
            ReportType             = dto.ReportType,
            Description            = dto.Description,
            PhotoURL               = dto.PhotoURL,
            AI_Score               = aiScore,
            UserReputationOnSubmit = isDriver ? 0 : userReputation,   // drivers have no rep
            FinalConfidence        = finalConfidence,
            IsApproved             = autoApprove ? true : null
        };

        await _reportRepo.AddAsync(report);

        if (autoApprove)
        {
            if (dto.TrashContainerId > 0)
                await _containerUpdateService.ApplyReportEffectAsync(dto.TrashContainerId, dto.ReportType);
            if (!isDriver)
                await IncrementReputationAndNotifyAsync(userId, userName);
        }
        else if (!isTruckReport)
        {
            // Report pending admin review — notify admins
            await _hub.Clients.All.SendAsync("ReportCreated", new
            {
                ReportId    = report.Id,
                ContainerId = dto.TrashContainerId > 0 ? dto.TrashContainerId : (int?)null,
                ReportType  = dto.ReportType.ToString(),
                UserName    = userName,
                CreatedAt   = report.CreatedAt
            });
        }

        if (isTruckReport)
        {
            await _hub.Clients.All.SendAsync("TruckProblemReported", new
            {
                ReportId    = report.Id,
                ContainerId = dto.TrashContainerId > 0 ? dto.TrashContainerId : (int?)null,
                Reporter    = userName,
                Description = dto.Description ?? string.Empty,
                CreatedAt   = report.CreatedAt
            });
        }

        string message = autoApprove
            ? "Сигналът е автоматично одобрен."
            : hasPhoto && !containerDetected
                ? "Не е открит контейнер на снимката — сигналът е изпратен за модерация."
                : "Сигналът е изпратен за модерация.";

        return new ReportResponseDto
        {
            ReportId          = report.Id,
            FinalConfidence   = finalConfidence,
            IsApproved        = report.IsApproved,
            AiScore           = aiScore,
            AiDetectedClass   = aiResult?.DetectedClass ?? string.Empty,
            UserReputation    = isDriver ? 0 : userReputation,
            ContainerDetected = containerDetected,
            Message           = message
        };
    }

    public async Task ApproveAsync(int reportId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new InvalidOperationException($"Report {reportId} not found.");

        report.IsApproved = true;
        await _reportRepo.UpdateAsync(report);

        if (report.TrashContainerId.HasValue)
            await _containerUpdateService.ApplyReportEffectAsync(report.TrashContainerId.Value, report.ReportType);

        bool isDriver = await IsDriverAsync(report.UserId);
        if (!isDriver)
            await IncrementReputationAndNotifyAsync(report.UserId, report.UserName);

        // Notify the reporter that their report was approved
        await _hub.Clients.All.SendAsync("ReportStatusChanged", new
        {
            ReportId    = report.Id,
            ContainerId = report.TrashContainerId,
            IsApproved  = true,
            UserId      = report.UserId,
            ReportType  = report.ReportType.ToString()
        });
    }

    public async Task RejectAsync(int reportId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new InvalidOperationException($"Report {reportId} not found.");

        report.IsApproved = false;
        await _reportRepo.UpdateAsync(report);

        if (!await IsDriverAsync(report.UserId))
            await _reputationService.DecrementAsync(report.UserId);

        // Notify the reporter that their report was rejected
        await _hub.Clients.All.SendAsync("ReportStatusChanged", new
        {
            ReportId    = report.Id,
            ContainerId = report.TrashContainerId,
            IsApproved  = false,
            UserId      = report.UserId,
            ReportType  = report.ReportType.ToString()
        });
    }

    #endregion

    #region Private

    private async Task IncrementReputationAndNotifyAsync(string userId, string userName)
    {
        await _reputationService.IncrementAsync(userId);

        // Read the updated reputation to include in the notification
        var updatedUser = await _userManager.FindByIdAsync(userId);
        var newReputation = updatedUser?.Reputation ?? 0;

        await _hub.Clients.All.SendAsync("ReputationIncreased", new
        {
            UserId        = userId,
            UserName      = userName,
            NewReputation = newReputation
        });
    }

    private async Task<bool> IsDriverAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return false;
        return await _userManager.IsInRoleAsync(user, "Driver");
    }

    private static double CalculateConfidence(double aiScore, int reputation, bool hasPhoto)
    {
        // No photo: confidence is reputation-only (max 40 when rep = 100).
        if (!hasPhoto)
            return Math.Round(reputation * ReputationWeight, 2);

        // Photo submitted but AI returned no usable score (service down, unreadable
        // image, etc.).  Do NOT reward the user with their raw reputation — that would
        // make an AI failure produce a *higher* score than a successful weighted blend.
        // Treat it the same as no photo.
        if (aiScore <= 0)
            return Math.Round(reputation * ReputationWeight, 2);

        // Normal case: weighted blend — AI score (60 %) + reputation (40 %).
        return Math.Round((aiScore * AiWeight) + (reputation * ReputationWeight), 2);
    }

    private static int GetReputationFromRole(string role) => role switch
    {
        "Admin"  => 100,
        "Driver" => 80,
        _        => 50
    };

    #endregion
}
