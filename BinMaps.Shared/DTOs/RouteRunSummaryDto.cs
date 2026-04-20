using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

/// <summary>
/// Compact projection used in the admin "Маршрути" history list.
/// </summary>
public sealed class RouteRunSummaryDto
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

    /// <summary>Convenience: minutes between StartedAt and CompletedAt (0 if still Active).</summary>
    public double DurationMinutes { get; init; }
}
