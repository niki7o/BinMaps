using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace BinMaps.Infrastructure.Services;

public sealed class ContainerUpdateService : IContainerUpdateService
{
    private readonly IRepository<TrashContainer, int> _containerRepo;
    private readonly IHubContext<ContainerHub> _hub;

    public ContainerUpdateService(
        IRepository<TrashContainer, int> containerRepo,
        IHubContext<ContainerHub> hub)
    {
        _containerRepo = containerRepo;
        _hub = hub;
    }

    #region IContainerUpdateService

    public async Task ApplyReportEffectAsync(int containerId, ReportType reportType)
    {
        var container = await _containerRepo.GetByIdAsync(containerId)
            ?? throw new InvalidOperationException($"Container {containerId} not found.");

        ApplyEffect(container, reportType);
        await _containerRepo.UpdateAsync(container);

        await _hub.Clients.All.SendAsync("ContainersUpdated", new[]
        {
            new
            {
                container.Id,
                container.FillPercentage,
                container.Temperature,
                container.BatteryPercentage,
                Status = (int?)container.Status
            }
        });
    }

    #endregion

    #region Private

    private static void ApplyEffect(TrashContainer container, ReportType reportType)
    {
        container.Status = reportType switch
        {
            ReportType.Fire => TrashContainerStatus.Fire,
            ReportType.SensorBroken => TrashContainerStatus.SensorBroken,
            ReportType.ContainerDamage => TrashContainerStatus.Offline,
            _ => container.Status
        };

        if (reportType == ReportType.Full)
            container.FillPercentage = Math.Min(container.FillPercentage, 95.0);
    }

    #endregion
}