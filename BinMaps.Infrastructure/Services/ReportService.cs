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
        string role)
    {
        var dbUser         = await _userManager.FindByIdAsync(userId);
        var userReputation = dbUser?.Reputation ?? GetReputationFromRole(role);

        var hasPhoto      = dto.Photo is not null;
        var isAdmin       = role == "Admin";
        var isDriver      = role == "Driver";
        var isTruckReport = dto.ReportType == ReportType.TruckProblem;

        AIResultDto? aiResult = null;
        if (hasPhoto)
            aiResult = await _aiService.AnalyzeAsync(dto.Photo!);

        var aiScore         = aiResult?.Confidence ?? 0.0;
        var finalConfidence = CalculateConfidence(aiScore, userReputation, hasPhoto);

        var autoReject  = !isAdmin && userReputation < AutoRejectBelowReputation && dto.ReportType != ReportType.Fire;

        bool autoApprove;
        if (isAdmin)
            autoApprove = true;
        else if (isDriver && isTruckReport)
            autoApprove = true;
        else
            autoApprove = false;

        var report = new Report
        {
            UserId                 = userId,
            UserName               = userName,
            TrashContainerId       = dto.TrashContainerId > 0 ? dto.TrashContainerId : null,
            ReportType             = dto.ReportType,
            Description            = dto.Description,
            PhotoURL               = dto.PhotoURL,
            AI_Score               = aiScore,
            UserReputationOnSubmit = userReputation,
            FinalConfidence        = finalConfidence,
            IsApproved             = autoReject ? false : (autoApprove ? true : null)
        };

        await _reportRepo.AddAsync(report);

        if (autoApprove)
        {
            if (dto.TrashContainerId > 0)
                await _containerUpdateService.ApplyReportEffectAsync(dto.TrashContainerId, dto.ReportType);
            await _reputationService.IncrementAsync(userId);
        }
        else if (autoReject)
        {
            await _reputationService.DecrementAsync(userId);
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

        string message = autoReject
            ? "Сигналът е автоматично отхвърлен поради ниска репутация."
            : autoApprove
                ? "Сигналът е автоматично одобрен."
                : "Сигналът е изпратен за модерация.";

        return new ReportResponseDto
        {
            ReportId        = report.Id,
            FinalConfidence = finalConfidence,
            IsApproved      = report.IsApproved,
            AiScore         = aiScore,
            UserReputation  = userReputation,
            Message         = message
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

        await _reputationService.IncrementAsync(report.UserId);
    }

    public async Task RejectAsync(int reportId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new InvalidOperationException($"Report {reportId} not found.");

        report.IsApproved = false;
        await _reportRepo.UpdateAsync(report);

        await _reputationService.DecrementAsync(report.UserId);
    }

    #endregion

    #region Private

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
