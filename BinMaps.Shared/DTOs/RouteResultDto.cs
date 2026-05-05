using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

public sealed class RouteResultDto
{
    public int TruckId { get; init; }
    public string AreaId { get; init; } = string.Empty;
    public TrashType TrashType { get; init; }
    /// <summary>
    /// Truck depot (starting position). LocationX = longitude, LocationY = latitude
    /// — same convention as every other entity in this project. Sent to the
    /// frontend so the map can build a closed round-trip via OSRM
    /// (depot → stops → depot) instead of ending the route at the last container.
    /// </summary>
    public double DepotX { get; init; }   // longitude
    public double DepotY { get; init; }   // latitude
    public List<ContainerStopDto> Route { get; init; } = new();
    public double TotalDistance { get; init; }
    public double TotalLoad { get; init; }
    public double TruckCapacity { get; init; }
    public double CapacityUtilization { get; init; }
    public int ContainersCount { get; init; }
    public double EstimatedTimeMinutes { get; init; }
    public string Message { get; init; } = string.Empty;
}
