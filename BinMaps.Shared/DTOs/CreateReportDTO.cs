using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

public sealed class CreateReportDTO
{
    public int? TrashContainerId { get; set; }

    [Required]
    public ReportType ReportType { get; set; }

    public IFormFile? Photo { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? PhotoURL { get; set; }

    [Range(-180, 180)]
    public double? LocationX { get; set; }

    [Range(-90, 90)]
    public double? LocationY { get; set; }

    public bool? PreComputedContainerDetected { get; set; }
    public string? PreComputedDetectedClass { get; set; }
    public double? PreComputedConfidence { get; set; }
}