using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
[Produces("application/json")]
public sealed class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;
    private readonly IAIService     _aiService;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public ReportsController(
        IReportService reportService,
        IAIService aiService,
        IWebHostEnvironment environment,
        IConfiguration configuration)
    {
        _reportService = reportService;
        _aiService     = aiService;
        _environment   = environment;
        _configuration = configuration;
    }

    #region Endpoints

    [HttpPost]
    [ProducesResponseType(typeof(ReportResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromForm] CreateReportDTO dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        // ── Type-specific validation ─────────────────────────────────
        if (dto.ReportType == ReportType.MissingContainer)
        {
            if (dto.LocationX is null || dto.LocationY is null)
            {
                return Problem(
                    title: "Missing location",
                    detail: "A MissingContainer request requires map coordinates.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (dto.TrashContainerId is > 0)
            {
                return Problem(
                    title: "Invalid payload",
                    detail: "MissingContainer requests must NOT reference an existing container.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            // Region bounds check (same policy as POST /api/containers)
            var bounds = _configuration.GetSection("Region:Bounds");
            double? south = bounds.GetValue<double?>("South");
            double? west  = bounds.GetValue<double?>("West");
            double? north = bounds.GetValue<double?>("North");
            double? east  = bounds.GetValue<double?>("East");
            if (south is not null && west is not null && north is not null && east is not null)
            {
                if (dto.LocationY < south || dto.LocationY > north ||
                    dto.LocationX < west  || dto.LocationX > east)
                {
                    return Problem(
                        title: "Outside region bounds",
                        detail: $"Coordinates ({dto.LocationY:F5}, {dto.LocationX:F5}) " +
                                "are outside the configured pilot region.",
                        statusCode: StatusCodes.Status400BadRequest);
                }
            }
        }
        else
        {
            if (dto.TrashContainerId is null or <= 0)
            {
                return Problem(
                    title: "Missing container reference",
                    detail: "This report type requires a TrashContainerId.",
                    statusCode: StatusCodes.Status400BadRequest);
            }
        }

        try
        {

            dto.PhotoURL = null;
            AIResultDto? aiResult = null;
            // Skip AI analysis for MissingContainer — the photo is of a street,
            // not a trash bin, so the classifier would return noise.
            bool runAi = dto.ReportType != ReportType.MissingContainer;
            if (runAi && dto.Photo is not null)
            {
                if (dto.PreComputedContainerDetected.HasValue)
                {
                    aiResult = new AIResultDto
                    {
                        ContainerDetected = dto.PreComputedContainerDetected.Value,
                        DetectedClass = dto.PreComputedDetectedClass ?? string.Empty,
                        Confidence = dto.PreComputedConfidence ?? 0
                    };
                }
                else
                {
                    aiResult = await _aiService.AnalyzeAsync(dto.Photo);
                }
            }
            if (dto.Photo is not null)
            {
                var webRoot = _environment.WebRootPath
                    ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                var uploadsDir = Path.Combine(webRoot, "uploads", "reports");
                Directory.CreateDirectory(uploadsDir);

                var fileName = $"{Guid.NewGuid()}{Path.GetExtension(dto.Photo.FileName)}";
                var fullPath = Path.Combine(uploadsDir, fileName);
                using var ms = new MemoryStream();
                await dto.Photo.CopyToAsync(ms);
                ms.Position = 0;
                await System.IO.File.WriteAllBytesAsync(fullPath, ms.ToArray());

                dto.PhotoURL = $"/uploads/reports/{fileName}";
            }

            var userId   = User.FindFirstValue(ClaimTypes.NameIdentifier)
                           ?? throw new InvalidOperationException("UserId claim missing.");
            var userName = User.FindFirstValue(ClaimTypes.Name)
                           ?? User.FindFirstValue("name")
                           ?? userId;
            var role     = User.FindFirstValue(ClaimTypes.Role) ?? "User";
            var result = await _reportService.CreateAsync(dto, userId, userName, role, aiResult);
            return Ok(result);
        }
        catch (Exception ex)
        {
            
            var env = HttpContext.RequestServices
                          .GetRequiredService<IWebHostEnvironment>();
            var detail = env.IsDevelopment() ? ex.ToString() : "Грешка при създаване на доклада.";
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = detail });
        }
    }

    [HttpPost("analyze")]
    [ProducesResponseType(typeof(AIResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> AnalyzePhoto([FromForm] IFormFile? photo)
    {
        if (photo is null)
            return BadRequest(new { error = "Липсва снимка." });

        var result = await _aiService.AnalyzeAsync(photo);

    
        return Ok(result ?? new AIResultDto { ContainerDetected = true, Confidence = 0 });
    }

    [HttpPut("{id:int}/approve")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Approve([FromRoute] int id)
    {
        await _reportService.ApproveAsync(id);
        return NoContent();
    }

    [HttpPut("{id:int}/reject")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reject([FromRoute] int id)
    {
        await _reportService.RejectAsync(id);
        return NoContent();
    }

    #endregion
}