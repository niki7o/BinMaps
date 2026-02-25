using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BinMaps.Data.Entities;

public sealed class TrashContainer
{
    #region Identity

    [Key]
    public int Id { get; set; }

    #endregion

    #region Location

    [Required]
    [MaxLength(50)]
    public string AreaId { get; set; } = string.Empty;

    [Required]
    [Range(-90, 90)]
    public double LocationX { get; set; }

    [Required]
    [Range(-180, 180)]
    public double LocationY { get; set; }

    #endregion

    #region Physical

    [Required]
    [Range(100, 100_000)]
    public double Capacity { get; set; }

    [Required]
    public TrashType TrashType { get; set; }

    [Required]
    public bool HasSensor { get; set; }

    #endregion

    #region Telemetry

    [Range(0, 100)]
    public double FillPercentage { get; set; }

    [Range(-50, 100)]
    public double? Temperature { get; set; }

    [Range(0, 100)]
    public double? BatteryPercentage { get; set; }

    [Required]
    public TrashContainerStatus Status { get; set; } = TrashContainerStatus.Active;

    public DateTime? LastEmptiedAt { get; set; }
    
    public DateTime? LastSensorReadAt { get; set; }

    #endregion

    #region Navigation

    [ForeignKey(nameof(AreaId))]
    public Area? Area { get; set; }

    public ICollection<Report> Reports { get; set; } = new List<Report>();

    #endregion
}