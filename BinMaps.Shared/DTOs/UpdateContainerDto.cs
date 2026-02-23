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
}