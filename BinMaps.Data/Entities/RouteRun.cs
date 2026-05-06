using BinMaps.Data.Entities.Enums;
using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BinMaps.Data.Entities
{
  
    public sealed class RouteRun
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(450)]            
        public string DriverId { get; set; } = string.Empty;

        [MaxLength(256)]
        public string DriverName { get; set; } = string.Empty;

        [Required]
        [ForeignKey(nameof(Area))]
        [MaxLength(50)]
        public string AreaId { get; set; } = string.Empty;
        public Area? Area { get; set; }

        [Required]
        public TrashType TrashType { get; set; }

        public int? TruckId { get; set; }
        public Truck? Truck { get; set; }

        [Required]
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;

        public DateTime? CompletedAt { get; set; }

        [Required]
        public RouteRunStatus Status { get; set; } = RouteRunStatus.Active;

        public double PlannedDistanceKm { get; set; }

        public double PlannedMinutes { get; set; }

        public double CollectedLoad { get; set; }

        public int StopsCompleted { get; set; }

        public int StopsPlanned { get; set; }

        public string? StopsJson { get; set; }
    }

    public enum RouteRunStatus
    {
        Active = 0,
        Completed = 1,
        Cancelled = 2,
    }
}
