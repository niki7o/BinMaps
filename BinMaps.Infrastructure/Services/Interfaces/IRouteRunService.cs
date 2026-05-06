using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IRouteRunService
{
    Task<int> StartAsync(string driverId, string driverName, StartRouteRunDto dto);

    Task<bool> CompleteAsync(int runId, string driverId, CompleteRouteRunDto dto);

    Task<(IReadOnlyList<RouteRunSummaryDto> Items, int Total)> GetHistoryAsync(
        string? driverId = null,
        string? areaId = null,
        string? status = null,
        int skip = 0,
        int take = 20);

    Task<RouteRunDetailDto?> GetByIdAsync(int runId);

    Task<bool> CancelAsync(int runId);

    Task<bool> DeleteAsync(int runId);
}
