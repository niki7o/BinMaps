using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

public sealed class StartRouteRunDto
{
    public string AreaId { get; init; } = string.Empty;
    public TrashType TrashType { get; init; }
    public int? TruckId { get; init; }
    public double PlannedDistanceKm { get; init; }
    public double PlannedMinutes { get; init; }
    public int StopsPlanned { get; init; }

    public List<RouteStopSnapshotDto>? Stops { get; init; }
}

public sealed class RouteStopSnapshotDto
{
    public int Id { get; init; }
    public string AreaId { get; init; } = string.Empty;
    public double Lat { get; init; }
    public double Lng { get; init; }
    public double Fill { get; init; }
    public double Capacity { get; init; }
}
