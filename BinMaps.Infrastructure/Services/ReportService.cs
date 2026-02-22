using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;

namespace BinMaps.Infrastructure.Services;

public sealed class ReportService : IReportService
{
    private readonly IRepository<Report, int> _reportRepo;
    private readonly IAIService _aiService;
    private readonly IReputationService _reputationService;
    private readonly IContainerUpdateService _containerUpdateService;
    private readonly UserManager<User> _userManager;

    private static readonly ReportType[] DriverOnlyTypes =
        { ReportType.TruckProblem, ReportType.ContainerDamage };

    public ReportService(
        IRepository<Report, int> reportRepo,
        IAIService aiService,
        IReputationService reputationService,
        IContainerUpdateService containerUpdateService,
        UserManager<User> userManager)
    {
        _reportRepo = reportRepo;
        _aiService = aiService;
        _reputationService = reputationService;
        _containerUpdateService = containerUpdateService;
        _userManager = userManager;
    }

    #region Public

    public async Task<int> CreateAsync(CreateReportDTO dto, string userId, string userName, string role)
    {
        ValidateRole(dto.ReportType, role);

        var user = await _userManager.FindByIdAsync(userId);
        var reputation = user?.Reputation ?? 50;

        var aiResult = dto.Photo is not null
            ? await _aiService.AnalyzeAsync(dto.Photo)
            : null;

        var finalConfidence = CalculateFinalConfidence(aiResult, reputation);
        var isAutoApproved = finalConfidence >= 80 || dto.ReportType == ReportType.Fire;

        var report = new Report
        {
            TrashContainerId = dto.TrashContainerId,
            UserId = userId,
            UserName = userName,
            Description = dto.Description ?? BuildDefaultDescription(dto.ReportType),
            ReportType = dto.ReportType,
            AI_Score = aiResult?.Confidence ?? 0,
            UserReputationOnSubmit = reputation,
            FinalConfidence = finalConfidence,
            IsApproved = isAutoApproved ? true : null
        };

        await _reportRepo.AddAsync(report);

        if (isAutoApproved && dto.TrashContainerId.HasValue)
            await _containerUpdateService.ApplyReportEffectAsync(dto.TrashContainerId.Value, dto.ReportType);

        return report.Id;
    }

    public async Task ApproveAsync(int reportId, string reviewerUserId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new KeyNotFoundException($"Доклад #{reportId} не е намерен.");

        if (report.IsApproved.HasValue)
            throw new InvalidOperationException("Докладът вече е прегледан.");

        report.IsApproved = true;
        report.ReviewedAt = DateTime.UtcNow;
        report.ReviewedByUserId = reviewerUserId;

        await _reportRepo.UpdateAsync(report);
        await _reputationService.IncrementAsync(report.UserId);

        if (report.TrashContainerId.HasValue)
            await _containerUpdateService.ApplyReportEffectAsync(report.TrashContainerId.Value, report.ReportType);
    }

    public async Task RejectAsync(int reportId, string reviewerUserId)
    {
        var report = await _reportRepo.GetByIdAsync(reportId)
            ?? throw new KeyNotFoundException($"Доклад #{reportId} не е намерен.");

        if (report.IsApproved.HasValue)
            throw new InvalidOperationException("Докладът вече е прегледан.");

        report.IsApproved = false;
        report.ReviewedAt = DateTime.UtcNow;
        report.ReviewedByUserId = reviewerUserId;

        await _reportRepo.UpdateAsync(report);
        await _reputationService.DecrementAsync(report.UserId);
    }

    #endregion

    #region Private

    private static void ValidateRole(ReportType type, string role)
    {
        if (DriverOnlyTypes.Contains(type) && role is not ("Driver" or "Admin"))
            throw new UnauthorizedAccessException("Нямаш право за този тип доклад.");
    }

    private static double CalculateFinalConfidence(AIResultDto? ai, int reputation)
    {
        if (ai is null) return reputation * 0.4;
        return (ai.Confidence * 0.6) + (reputation * 0.4);
    }

    private static string BuildDefaultDescription(ReportType reportType) => reportType switch
    {
        ReportType.Full => "Контейнерът е препълнен",
        ReportType.Fire => "Пожар в контейнер",
        ReportType.SensorBroken => "Повреден сензор",
        ReportType.TruckProblem => "Проблем с камиона",
        ReportType.ContainerDamage => "Повреден контейнер",
        _ => "Докладване на проблем"
    };

    #endregion
}