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

        // Report types that the AI cannot meaningfully analyse from a photo
        // (sensor issues, truck problems, physical damage) — these should be
        // applied to the map immediately without AI gating.
        var isNonPhotoVerifiable =
            dto.ReportType == ReportType.SensorBroken ||
            dto.ReportType == ReportType.TruckProblem ||
            dto.ReportType == ReportType.ContainerDamage;

        // Use precomputed AI result from controller (photo stream was fresh there),
        // or fall back to calling AI here if no precomputed result was supplied.
        AIResultDto? aiResult = precomputedAiResult;
        if (aiResult is null && dto.Photo is not null)
            aiResult = await _aiService.AnalyzeAsync(dto.Photo!);

        var aiScore            = aiResult?.Confidence       ?? 0.0;
        var containerDetected  = aiResult?.ContainerDetected ?? true;  // true when no photo

        // Drivers do not participate in the reputation formula — their score is
        // determined by the AI alone.  Regular users keep the weighted blend.
        var finalConfidence = isDriver
            ? aiScore                                                    // driver: AI only
            : CalculateConfidence(aiScore, userReputation, hasPhoto);   // user: AI + rep

        // ── Auto-approve rules ────────────────────────────────────────────────
        bool autoApprove;
        if (isAdmin)
        {
            // Admins always auto-approve.
            autoApprove = true;
        }
        else if (isDriver)
        {
            // Drivers auto-approve everything EXCEPT when:
            //   - a photo was submitted, the AI responded, and AI score is very low (< 20).
            bool aiVeryLow = hasPhoto && aiScore > 0 && aiScore < 20.0;
            autoApprove = !aiVeryLow;
        }
        else
        {
            // Regular users:
            //   - Non-photo-verifiable types (sensor broken, container damage) are
            //     auto-approved so they appear on the map immediately.
            //   - All other types go to moderation.
            //   - If the AI says no container was detected, force pending even for
            //     types that would otherwise be auto-approved.
            bool photoPresentButNoBin = hasPhoto && aiResult is not null && !containerDetected;
            autoApprove = isNonPhotoVerifiable && !photoPresentButNoBin;
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
                await _reputationService.IncrementAsync(userId);   // drivers earn no rep
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

        if (!await IsDriverAsync(report.UserId))
            await _reputationService.IncrementAsync(report.UserId);
    }

    public async Task RejectAsync(int reportId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new InvalidOperationException($"Report {reportId} not found.");

        report.IsApproved = false;
        await _reportRepo.UpdateAsync(report);

        if (!await IsDriverAsync(report.UserId))
            await _reputationService.DecrementAsync(report.UserId);
    }

    #endregion

    #region Private

    private async Task<bool> IsDriverAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return false;
        return await _userManager.IsInRoleAsync(user, "Driver");
    }

    private static double CalculateConfidence(double aiScore, int reputation, bool hasPhoto)
    {
        if (!hasPhoto)
            return reputation * ReputationWeight;

        if (aiScore <= 0)
            return reputation;

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
