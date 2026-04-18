using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

/// <summary>
/// Payload for POST /api/containers.
///
/// By convention used throughout this codebase:
///   LocationX = longitude
///   LocationY = latitude
/// (map.ts renders Leaflet markers as [locationY, locationX] == [lat, lng]).
/// </summary>
public sealed class CreateContainerDTO
{
    [Required]
    [MaxLength(50)]
    public string AreaId { get; set; } = string.Empty;

    /// <summary>Longitude of the container (WGS84, in degrees).</summary>
    [Required]
    [Range(-180, 180)]
    public double LocationX { get; set; }

    /// <summary>Latitude of the container (WGS84, in degrees).</summary>
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
