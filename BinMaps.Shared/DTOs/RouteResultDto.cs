using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

public sealed class RouteResultDto
{
    public int TruckId { get; init; }
    public string AreaId { get; init; } = string.Empty;
    public TrashType TrashType { get; init; }
    public double DepotX { get; init; }  
    public double DepotY { get; init; }   
    public List<ContainerStopDto> Route { get; init; } = new();
    public double TotalDistance { get; init; }
    public double TotalLoad { get; init; }
    public double TruckCapacity { get; init; }
    public double CapacityUtilization { get; init; }
    public int ContainersCount { get; init; }
    public double EstimatedTimeMinutes { get; init; }
    public string Message { get; init; } = string.Empty;
}
