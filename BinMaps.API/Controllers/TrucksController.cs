using System.Security.Claims;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/trucks")]
[Authorize(Roles = "Driver,Admin")]
[Produces("application/json")]
public sealed class TrucksController : ControllerBase
{
    private readonly ITruckRouteService _routeService;
    private readonly IRouteRunService _routeRunService;

    public TrucksController(
        ITruckRouteService routeService,
        IRouteRunService routeRunService)
    {
        _routeService = routeService;
        _routeRunService = routeRunService;
    }

    #region Route generation

    [HttpGet("route")]
    [ProducesResponseType(typeof(RouteResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GenerateRoute(
        [FromQuery] string areaId,
        [FromQuery] TrashType trashType)
    {
        if (string.IsNullOrWhiteSpace(areaId))
            return BadRequest(new { message = "areaId е задължителен." });

        try
        {
            var result = await _routeService.GenerateRouteAsync(areaId, trashType);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    #endregion

    #region Route history (persistence)

    /// <summary>Driver opens a new route run. Returns the generated runId.</summary>
    [HttpPost("route/start")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> StartRun([FromBody] StartRouteRunDto dto)
    {
        var driverId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var driverName = User.Identity?.Name ?? string.Empty;
        if (string.IsNullOrWhiteSpace(driverId))
            return Unauthorized();

        try
        {
            var id = await _routeRunService.StartAsync(driverId, driverName, dto);
            return Ok(new { runId = id });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Driver closes a run. 404 if the run does not belong to the caller.</summary>
    [HttpPost("route/{id:int}/complete")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CompleteRun(int id, [FromBody] CompleteRouteRunDto dto)
    {
        var driverId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(driverId))
            return Unauthorized();

        var ok = await _routeRunService.CompleteAsync(id, driverId, dto);
        return ok ? NoContent() : NotFound(new { message = "Маршрутът не е намерен." });
    }

    /// <summary>Admin history list — most recent first.</summary>
    [HttpGet("route/history")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<RouteRunSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetHistory(
        [FromQuery] string? driverId = null,
        [FromQuery] string? areaId = null,
        [FromQuery] string? status = null,
        [FromQuery] int take = 100)
    {
        var list = await _routeRunService.GetHistoryAsync(driverId, areaId, status, take);
        return Ok(list);
    }

    /// <summary>Full detail of a single run (admin only).</summary>
    [HttpGet("route/{id:int}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(RouteRunDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetRun(int id)
    {
        var detail = await _routeRunService.GetByIdAsync(id);
        return detail is null
            ? NotFound(new { message = "Маршрутът не е намерен." })
            : Ok(detail);
    }

    #endregion
}
