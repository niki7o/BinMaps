using BinMaps.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public sealed class AnalyticsController : ControllerBase
{
    private readonly BinMapsDbContext _context;

    public AnalyticsController(BinMapsDbContext context)
    {
        _context = context;
    }

    #region Endpoints

    [HttpGet("zones")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetZoneStats()
    {
        var stats = await _context.TrashContainers
            .AsNoTracking()
            .GroupBy(c => c.AreaId)
            .Select(g => new
            {
                AreaId = g.Key,
                TotalContainers = g.Count(),
                AverageFill = Math.Round(g.Average(c => c.FillPercentage), 1),
                CriticalContainers = g.Count(c => c.FillPercentage >= 80),
                FireContainers = g.Count(c => c.Status.ToString() == "Fire"),
                OfflineContainers = g.Count(c => c.Status.ToString() == "Offline")
            })
            .OrderBy(x => x.AreaId)
            .ToListAsync();

        return Ok(stats);
    }

    [HttpGet("top-critical")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTopCritical([FromQuery] int count = 5)
    {
        var top = await _context.TrashContainers
            .AsNoTracking()
            .OrderByDescending(c => c.FillPercentage)
            .Take(count)
            .Select(c => new
            {
                c.Id,
                c.AreaId,
                c.FillPercentage,
                TrashType = c.TrashType.ToString(),
                Status = c.Status.ToString()
            })
            .ToListAsync();

        return Ok(top);
    }

    [HttpGet("distribution")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTrashTypeDistribution()
    {
        var dist = await _context.TrashContainers
            .AsNoTracking()
            .GroupBy(c => c.TrashType)
            .Select(g => new
            {
                TrashType = g.Key.ToString(),
                Count = g.Count(),
                AvgFill = Math.Round(g.Average(c => c.FillPercentage), 1)
            })
            .ToListAsync();

        return Ok(dist);
    }

    #endregion
}