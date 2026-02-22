using BinMaps.Data.Entities.Enums;
namespace BinMaps.Shared.DTOs;
public sealed class TrashContainerRouteDto
{
    public int Id { get; set; }

    public string AreaId { get; set; } = string.Empty;

    public double Capacity { get; set; }

    public double FillPercentage { get; set; }

    public bool HasSensor { get; set; }

    public double LocationX { get; set; }

    public double LocationY { get; set; }

    public double? Temperature { get; set; }

    public TrashType TrashType { get; set; }

    public TrashContainerStatus Status { get; set; }

    public int StopNumber { get; set; }

    public double DistanceFromPrevious { get; set; }

    public double EstimatedLoad { get; set; }

}