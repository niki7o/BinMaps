using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services;

public sealed class ReportService : IReportService
{
    private const double AiWeight = 0.6;
    private const double ReputationWeight = 0.4;
    private const double AutoApproveThreshold = 80.0;

    private readonly IRepository<Report, int> _reportRepo;
    private readonly IAIService _aiService;
    private readonly IReputationService _reputationService;
    private readonly IContainerUpdateService _containerUpdateService;

    public ReportService(
        IRepository<Report, int> reportRepo,
        IAIService aiService,
        IReputationService reputationService,
        IContainerUpdateService containerUpdateService)
    {
        _reportRepo = reportRepo;
        _aiService = aiService;
        _reputationService = reputationService;
        _containerUpdateService = containerUpdateService;
    }

    #region Public

    public async Task<ReportResponseDto> CreateAsync(
        CreateReportDTO dto,
        string userId,
        string userName,
        string role)
    {
        AIResultDto? aiResult = null;
        if (dto.Photo is not null)
            aiResult = await _aiService.AnalyzeAsync(dto.Photo);

        var userReputation = GetReputationFromRole(role);
        var aiScore = aiResult?.Confidence ?? 0.0;
        var finalConfidence = CalculateConfidence(aiScore, userReputation);
        var autoApprove = finalConfidence >= AutoApproveThreshold
                            || dto.ReportType == ReportType.Fire;

        var report = new Report
        {
            UserId = userId,
            UserName = userName,
            TrashContainerId = dto.TrashContainerId,
            ReportType = dto.ReportType,
            Description = dto.Description,
            AI_Score = aiScore,
            UserReputationOnSubmit = userReputation,
            FinalConfidence = finalConfidence,
            IsApproved = autoApprove 
        }; 

        await _reportRepo.AddAsync(report);

        if (autoApprove)
        {
            await _containerUpdateService.ApplyReportEffectAsync(dto.TrashContainerId, dto.ReportType);
            await _reputationService.IncrementAsync(userId);
        }

        return new ReportResponseDto
        {
            ReportId = report.Id,
            FinalConfidence = finalConfidence,
            IsApproved = report.IsApproved,
            AiScore = aiScore,
            UserReputation = userReputation,
            Message = autoApprove ? "Докладът е автоматично одобрен." : "Докладът е изпратен за модерация."
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

    private static double CalculateConfidence(double aiScore, int reputation)
    {
        if (aiScore <= 0)
            return reputation * ReputationWeight;

        return Math.Round((aiScore * AiWeight) + (reputation * ReputationWeight), 2);
    }

    private static int GetReputationFromRole(string role) => role switch
    {
        "Admin" => 100,
        "Driver" => 75,
        _ => 50
    };

    #endregion
}