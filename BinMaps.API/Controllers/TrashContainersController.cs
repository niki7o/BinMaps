using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/containers")]
[Authorize]
[Produces("application/json")]
public sealed class TrashContainersController : ControllerBase
{
    private readonly IRepository<TrashContainer, int> _containerRepo;

    public TrashContainersController(IRepository<TrashContainer, int> containerRepo)
    {
        _containerRepo = containerRepo;
    }

    #region Read

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? areaId,
        [FromQuery] TrashType? trashType,
        [FromQuery] TrashContainerStatus? status)
    {
        var query = _containerRepo
            .GetAllAttached()
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(areaId))
            query = query.Where(c => c.AreaId == areaId);

        if (trashType.HasValue)
            query = query.Where(c => c.TrashType == trashType.Value);

        if (status.HasValue)
            query = query.Where(c => c.Status == status.Value);

        var result = await query.Select(c => new
        {
            c.Id,
            c.AreaId,
            c.FillPercentage,
            c.Capacity,
            c.LocationX,
            c.LocationY,
            c.TrashType,
            c.Status,
            c.HasSensor,
            c.Temperature,
            c.BatteryPercentage
        }).ToListAsync();

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById([FromRoute] int id)
    {
        var container = await _containerRepo.GetByIdAsync(id);
        if (container is null)
            return NotFound();

        return Ok(new
        {
            container.Id,
            container.AreaId,
            container.FillPercentage,
            container.Capacity,
            container.LocationX,
            container.LocationY,
            container.TrashType,
            container.Status,
            container.HasSensor,
            container.Temperature,
            container.BatteryPercentage
        });
    }

    #endregion

    #region Write

    [HttpPut("{id:int}/empty")]
    [Authorize(Roles = "Driver,Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> EmptyContainer(
        [FromRoute] int id,
        [FromServices] IHubContext<ContainerHub> hubContext)
    {
        var container = await _containerRepo.GetByIdAsync(id);
        if (container is null)
            return NotFound();

        container.FillPercentage = 0;
        container.Status = TrashContainerStatus.Active;
        await _containerRepo.UpdateAsync(container);

        await hubContext.Clients.All.SendAsync("ContainersUpdated", new[]
        {
            new
            {
                Id                = id,
                FillPercentage    = 0.0,
                Temperature       = container.Temperature,
                BatteryPercentage = container.BatteryPercentage,
                Status            = (int)TrashContainerStatus.Active
            }
        });

        return NoContent();
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(
        [FromRoute] int id,
        [FromBody] UpdateContainerDTO dto,
        [FromServices] IHubContext<ContainerHub> hubContext)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var container = await _containerRepo.GetByIdAsync(id);
        if (container is null)
            return NotFound();

        container.FillPercentage = dto.FillPercentage;
        container.Status = dto.Status;
        container.HasSensor = dto.HasSensor;
        await _containerRepo.UpdateAsync(container);

        await hubContext.Clients.All.SendAsync("ContainersUpdated", new[]
        {
            new
            {
                Id                = id,
                FillPercentage    = dto.FillPercentage,
                Temperature       = container.Temperature,
                BatteryPercentage = container.BatteryPercentage,
                Status            = (int)dto.Status
            }
        });

        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete([FromRoute] int id)
    {
        var container = await _containerRepo.GetByIdAsync(id);
        if (container is null)
            return NotFound();

        await _containerRepo.DeleteAsync(container);
        return NoContent();
    }

    #endregion
}