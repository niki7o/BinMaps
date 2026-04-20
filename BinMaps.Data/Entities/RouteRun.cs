using BinMaps.Data.Entities.Enums;
using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BinMaps.Data.Entities
{
    /// <summary>
    /// Persisted log of a single "driver goes through a collection route" session.
    /// Created on route start and finalised on route completion.
    ///
    /// Intentionally keeps a JSON snapshot of the stops at the moment the route
    /// was generated, so the history is stable even if containers are later
    /// deleted or renumbered.
    /// </summary>
    public sealed class RouteRun
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(450)]            // Identity primary key default length
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

        /// <summary>Total path distance in km as computed at start.</summary>
        public double PlannedDistanceKm { get; set; }

        /// <summary>Planned ETA in minutes as computed at start.</summary>
        public double PlannedMinutes { get; set; }

        /// <summary>Actual collected load in litres (sum over visited stops).</summary>
        public double CollectedLoad { get; set; }

        /// <summary>How many stops on the planned route were actually visited.</summary>
        public int StopsCompleted { get; set; }

        /// <summary>Total number of stops on the planned route.</summary>
        public int StopsPlanned { get; set; }

        /// <summary>
        /// JSON array of stop snapshots (id, areaId, lat, lng, fill, capacity).
        /// Stored as a string so reads don't touch the container tables.
        /// </summary>
        public string? StopsJson { get; set; }
    }

    public enum RouteRunStatus
    {
        Active = 0,
        Completed = 1,
        Cancelled = 2,
    }
}
