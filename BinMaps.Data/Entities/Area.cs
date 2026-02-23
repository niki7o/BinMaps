using BinMaps.Data.Entities;
using System.ComponentModel.DataAnnotations;
namespace BinMaps.Data.Entities;

public sealed class Area
{
    #region Identity

    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    #endregion

    #region Multipliers

   public double FillMultiplier { get; set; } = 1.0;
    public double TemperatureMultiplier { get; set; } = 1.0;

    #endregion

    #region Navigation

    public ICollection<TrashContainer> TrashContainers { get; set; } = new List<TrashContainer>();
    public ICollection<Truck> Trucks { get; set; } = new List<Truck>();

    #endregion
}