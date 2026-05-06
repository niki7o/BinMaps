using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/areas")]
[Authorize]
[Produces("application/json")]
public sealed class AreasController : ControllerBase
{
    private readonly IRepository<Area, string> _areaRepo;

    public AreasController(IRepository<Area, string> areaRepo)
    {
        _areaRepo = areaRepo;
    }

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll()
    {
        var areas = await _areaRepo.GetAllAttached()
            .AsNoTracking()
            .OrderBy(a => a.Id)
            .Select(a => new
            {
                a.Id,
                a.Name,
                a.RiskLevel,
                a.Color,
                a.FillMultiplier,
                a.ZoneMultiplier
            })
            .ToListAsync();

        return Ok(areas);
    }
}
