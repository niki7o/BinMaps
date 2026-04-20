using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

/// <summary>
/// Full detail for a single RouteRun — includes the stop snapshot taken at start.
/// </summary>
public sealed class RouteRunDetailDto
{
    public int Id { get; init; }
    public string DriverId { get; init; } = string.Empty;
    public string DriverName { get; init; } = string.Empty;
    public string AreaId { get; init; } = string.Empty;
    public TrashType TrashType { get; init; }
    public int? TruckId { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    public string Status { get; init; } = string.Empty;

    public double PlannedDistanceKm { get; init; }
    public double PlannedMinutes { get; init; }
    public double CollectedLoad { get; init; }
    public int StopsCompleted { get; init; }
    public int StopsPlanned { get; init; }

    public double DurationMinutes { get; init; }

    public List<RouteStopSnapshotDto> Stops { get; init; } = new();
}
