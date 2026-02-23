using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Data.Entities;

namespace BinMaps.Infrastructure.Services;

public sealed class ContainerUpdateService : IContainerUpdateService
{
    private readonly IRepository<TrashContainer, int> _containerRepo;

    public ContainerUpdateService(IRepository<TrashContainer, int> containerRepo)
    {
        _containerRepo = containerRepo;
    }

    #region Public

    public async Task ApplyReportEffectAsync(int containerId, ReportType reportType)
    {
        var container = await _containerRepo.GetByIdAsync(containerId)
            ?? throw new InvalidOperationException($"Container {containerId} not found.");

        ApplyEffect(container, reportType);
        await _containerRepo.UpdateAsync(container);
    }

    #endregion

    #region Private

    private static void ApplyEffect(TrashContainer container, ReportType reportType)
    {
        container.Status = reportType switch
        {
            ReportType.Fire => TrashContainerStatus.Fire,
            ReportType.SensorBroken => TrashContainerStatus.SensorBroken,
            ReportType.Full => container.Status,
            _ => container.Status
        };

        if (reportType == ReportType.Full)
            container.FillPercentage = Math.Min(container.FillPercentage, 95.0);
    }

    #endregion
}