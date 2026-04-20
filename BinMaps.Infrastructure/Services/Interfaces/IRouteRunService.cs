using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services.Interfaces;

/// <summary>
/// Persistence for "driver goes through a collection route" sessions.
/// The driver client opens a run on start, and closes it on completion/cancellation.
/// Admin history views read these rows.
/// </summary>
public interface IRouteRunService
{
    /// <summary>Opens a new run and returns the generated id so the driver can broadcast it.</summary>
    Task<int> StartAsync(string driverId, string driverName, StartRouteRunDto dto);

    /// <summary>Closes an existing run owned by <paramref name="driverId"/>.</summary>
    Task<bool> CompleteAsync(int runId, string driverId, CompleteRouteRunDto dto);

    /// <summary>Admin list — most recent first, optionally filtered.</summary>
    Task<IReadOnlyList<RouteRunSummaryDto>> GetHistoryAsync(
        string? driverId = null,
        string? areaId = null,
        string? status = null,
        int take = 100);

    /// <summary>Full detail of a single run for the admin modal.</summary>
    Task<RouteRunDetailDto?> GetByIdAsync(int runId);
}
