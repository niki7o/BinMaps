using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;
namespace BinMaps.Shared.DTOs;

public sealed class UpdateContainerDTO
{
    [Range(0, 100)]
    public double FillPercentage { get; set; }

    [Required]
    public TrashContainerStatus Status { get; set; }

    public bool HasSensor { get; set; }

    [Range(0, 100)]
    public double? BatteryPercentage { get; set; }

    /// <summary>
    /// Optional — when provided, reassigns the container to a different zone.
    /// Must match an existing Area.Id.
    /// </summary>
    [MaxLength(50)]
    public string? AreaId { get; set; }
}