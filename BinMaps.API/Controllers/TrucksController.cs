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

    public TrucksController(ITruckRouteService routeService)
    {
        _routeService = routeService;
    }

    #region Endpoints

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
}