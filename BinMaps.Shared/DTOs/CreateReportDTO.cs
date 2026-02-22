using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

public sealed class CreateReportDTO
{
    [Required]
    public int TrashContainerId { get; set; }

    [Required]
    public ReportType ReportType { get; set; }

    public IFormFile? Photo { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }
}