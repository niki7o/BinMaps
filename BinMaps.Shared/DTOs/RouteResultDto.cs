using BinMaps.Data.Entities.Enums;

namespace BinMaps.Shared.DTOs;

public sealed class RouteResultDto
{
    public int TruckId { get; set; }
    public string AreaId { get; set; } = string.Empty;
    public TrashType TrashType { get; set; }
    public List<ContainerStopDTO> Route { get; set; } = new();
    public double TotalDistanceKm { get; set; }
    public double TotalLoadKg { get; set; }
    public double TruckCapacityKg { get; set; }
    public double CapacityUtilizationPercent { get; set; }
    public int ContainersCount { get; set; }
    public double EstimatedTimeMinutes { get; set; }
    public string Message { get; set; } = string.Empty;
}