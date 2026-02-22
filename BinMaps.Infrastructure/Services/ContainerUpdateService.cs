using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
namespace BinMaps.Infrastructure.Services;
public sealed class ContainerUpdateService : IContainerUpdateService
{
    private readonly IRepository<TrashContainer, int> _containerRepo;

    public ContainerUpdateService(IRepository<TrashContainer, int> containerRepo)
    {
        _containerRepo = containerRepo;
    }

    #region Apply
    public async Task ApplyReportEffectAsync(int containerId, ReportType reportType)
    {
        var container = await _containerRepo.GetByIdAsync(containerId);
        if (container is null) return;

        switch (reportType)
        {
            case ReportType.Full:
                container.FillPercentage = Math.Max(container.FillPercentage, 90.0);
                break;

            case ReportType.Fire:
                container.Status = TrashContainerStatus.Fire;
                if (container.HasSensor) container.Temperature = 60.0;
                break;

            case ReportType.SensorBroken:
                container.Status = TrashContainerStatus.SensorBroken;
                container.HasSensor = false;
                container.Temperature = null;
                container.BatteryPercentage = null;
                break;

            case ReportType.ContainerDamage:
                container.Status = TrashContainerStatus.Offline;
                break;
        }

        await _containerRepo.UpdateAsync(container);
   
    
    }
    #endregion
}