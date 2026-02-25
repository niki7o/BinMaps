using System.ComponentModel.DataAnnotations;

namespace BinMaps.Data.Entities;

public sealed class Area
{
    #region Identity

    [Key]
    [MaxLength(50)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    #endregion

    #region Multipliers

    [Required]
    [Range(0.1, 10.0)]
    public double ZoneMultiplier { get; set; } = 1.0;

    [Required]
    [Range(0.1, 10.0)]
    public double FillMultiplier { get; set; } = 1.0;

    [Required]
    [Range(0.1, 10.0)]
    public double TemperatureMultiplier { get; set; } = 1.0;

    #endregion

    #region Display

    [Required]
    [MaxLength(20)]
    public string RiskLevel { get; set; } = "Low";

    [Required]
    [MaxLength(7)]
    public string Color { get; set; } = "#10b981";

    #endregion

    #region Navigation

    public ICollection<TrashContainer> TrashContainers { get; set; } = new List<TrashContainer>();
    public ICollection<Truck> Trucks { get; set; } = new List<Truck>();

    #endregion
}