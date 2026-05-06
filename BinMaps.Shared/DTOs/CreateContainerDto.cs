using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

public sealed class CreateContainerDTO
{
    [Required]
    [MaxLength(50)]
    public string AreaId { get; set; } = string.Empty;

    [Required]
    [Range(-180, 180)]
    public double LocationX { get; set; }

    [Required]
    [Range(-90, 90)]
    public double LocationY { get; set; }

    [Required]
    [Range(100, 100_000, ErrorMessage = "Capacity must be between 100 and 100000 liters.")]
    public double Capacity { get; set; }

    [Required]
    public TrashType TrashType { get; set; }

    public bool HasSensor { get; set; }
}
