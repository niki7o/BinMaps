using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IContainerUpdateService
{
    Task ApplyReportEffectAsync(int containerId, ReportType reportType);
}