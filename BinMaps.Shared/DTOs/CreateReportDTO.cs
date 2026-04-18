using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

public sealed class CreateReportDTO
{
    /// <summary>
    /// Required for all report types EXCEPT <see cref="ReportType.MissingContainer"/>,
    /// which is a proposal to add a new container (no existing container yet).
    /// </summary>
    public int? TrashContainerId { get; set; }

    [Required]
    public ReportType ReportType { get; set; }

    public IFormFile? Photo { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? PhotoURL { get; set; }

    // ── Only used when ReportType == MissingContainer ──
    /// <summary>Longitude (WGS84). Required for MissingContainer.</summary>
    [Range(-180, 180)]
    public double? LocationX { get; set; }

    /// <summary>Latitude (WGS84). Required for MissingContainer.</summary>
    [Range(-90, 90)]
    public double? LocationY { get; set; }

    public bool? PreComputedContainerDetected { get; set; }
    public string? PreComputedDetectedClass { get; set; }
    public double? PreComputedConfidence { get; set; }
}