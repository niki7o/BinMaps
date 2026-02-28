using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
[Produces("application/json")]
public sealed class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;
    private readonly IWebHostEnvironment _environment;

    public ReportsController(IReportService reportService, IWebHostEnvironment environment)
    {
        _reportService = reportService;
        _environment = environment;
    }

    #region Endpoints

    [HttpPost]
    [ProducesResponseType(typeof(ReportResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromForm] CreateReportDTO dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        if (dto.Photo is not null)
        {
            var webRoot = _environment.WebRootPath
                ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var uploadsDir = Path.Combine(webRoot, "uploads", "reports");
            Directory.CreateDirectory(uploadsDir);

            var fileName = $"{Guid.NewGuid()}{Path.GetExtension(dto.Photo.FileName)}";
            var fullPath = Path.Combine(uploadsDir, fileName);

            await using var stream = new FileStream(fullPath, FileMode.Create);
            await dto.Photo.CopyToAsync(stream);

            dto.PhotoURL = $"/uploads/reports/{fileName}";
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var userName = User.FindFirstValue(ClaimTypes.Name)!;
        var role = User.FindFirstValue(ClaimTypes.Role) ?? "User";

        var result = await _reportService.CreateAsync(dto, userId, userName, role);
        return Ok(result);
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