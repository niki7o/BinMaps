﻿using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/containers")]
[Authorize]
[Produces("application/json")]
public sealed class TrashContainersController : ControllerBase
{
    private readonly IRepository<TrashContainer, int> _containerRepo;
    private readonly IRepository<Area, string> _areaRepo;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TrashContainersController> _logger;

    public TrashContainersController(
        IRepository<TrashContainer, int> containerRepo,
        IRepository<Area, string> areaRepo,
        IConfiguration configuration,
        ILogger<TrashContainersController> logger)
    {
        _containerRepo = containerRepo;
        _areaRepo = areaRepo;
        _configuration = configuration;
        _logger = logger;
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

        var raw = await query.Select(c => new
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
            c.BatteryPercentage,
            c.IsSeeded
        }).ToListAsync();

        var result = raw.Select(c => new
        {
            c.Id,
            c.AreaId,
            c.FillPercentage,
            c.Capacity,
            c.LocationX,
            c.LocationY,
            TrashType = (int)c.TrashType,
            Status    = (int)c.Status,
            c.HasSensor,
            c.Temperature,
            c.BatteryPercentage,
            c.IsSeeded
        });

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
            TrashType = (int)container.TrashType,
            Status    = (int)container.Status,
            container.HasSensor,
            container.Temperature,
            container.BatteryPercentage
        });
    }

    #endregion

    #region Write

    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(object), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromBody] CreateContainerDTO dto,
        [FromServices] IHubContext<ContainerHub> hubContext)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var bounds = _configuration.GetSection("Region:Bounds");
        double? south = bounds.GetValue<double?>("South");
        double? west = bounds.GetValue<double?>("West");
        double? north = bounds.GetValue<double?>("North");
        double? east = bounds.GetValue<double?>("East");
        if (south is not null && west is not null && north is not null && east is not null)
        {
            // LocationX = lng, LocationY = lat in this codebase.
            if (dto.LocationY < south || dto.LocationY > north ||
                dto.LocationX < west  || dto.LocationX > east)
            {
                return Problem(
                    title: "Outside region bounds",
                    detail: $"Coordinates ({dto.LocationY:F5}, {dto.LocationX:F5}) " +
                            $"are outside the configured region.",
                    statusCode: StatusCodes.Status400BadRequest);
            }
        }

        var area = await _areaRepo.GetByIdAsync(dto.AreaId);
        if (area is null)
        {
            return Problem(
                title: "Area not found",
                detail: $"AreaId '{dto.AreaId}' does not exist.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        double minDistanceMeters = _configuration
            .GetSection("Region")
            .GetValue<double?>("MinContainerDistanceMeters") ?? 15.0;

        double degreeLat = minDistanceMeters / 111_000.0;
        double degreeLng = minDistanceMeters /
                           (111_000.0 * Math.Cos(dto.LocationY * Math.PI / 180));

        var candidates = await _containerRepo.GetAllAttached()
            .AsNoTracking()
            .Where(c =>
                c.LocationY >= dto.LocationY - degreeLat &&
                c.LocationY <= dto.LocationY + degreeLat &&
                c.LocationX >= dto.LocationX - degreeLng &&
                c.LocationX <= dto.LocationX + degreeLng)
            .Select(c => new { c.Id, c.LocationX, c.LocationY })
            .ToListAsync();

        foreach (var c in candidates)
        {
            double d = HaversineMeters(
                dto.LocationY, dto.LocationX,
                c.LocationY,   c.LocationX);
            if (d < minDistanceMeters)
            {
                return Problem(
                    title: "Duplicate container",
                    detail: $"A container (#{c.Id}) already exists within " +
                            $"{d:F1}m of this location (minimum {minDistanceMeters}m).",
                    statusCode: StatusCodes.Status409Conflict);
            }
        }

        var existingIdsSorted = await _containerRepo
            .GetAllAttached()
            .IgnoreQueryFilters()
            .Select(c => c.Id)
            .Where(id => id > 0)
            .OrderBy(id => id)
            .ToListAsync();

        int nextId = 1;
        foreach (var id in existingIdsSorted)
        {
            if (id != nextId) break;  
            nextId++;
        }

        var container = new TrashContainer
        {
            Id              = nextId,
            AreaId          = dto.AreaId,
            LocationX       = dto.LocationX,
            LocationY       = dto.LocationY,
            Capacity        = dto.Capacity,
            TrashType       = dto.TrashType,
            HasSensor       = dto.HasSensor,
            FillPercentage  = 0,
            Status          = TrashContainerStatus.Active,
            BatteryPercentage = dto.HasSensor ? 100 : null,
            Temperature       = null,
        };

        await _containerRepo.AddAsync(container);

        string actor = User.Identity?.Name ?? "unknown";
        _logger.LogInformation(
            "Admin {Actor} created container #{Id} in area {Area} at ({Lat:F5},{Lng:F5}) type={Type} sensor={Sensor}",
            actor, container.Id, container.AreaId,
            container.LocationY, container.LocationX,
            container.TrashType, container.HasSensor);

        var payload = new
        {
            container.Id,
            container.AreaId,
            container.FillPercentage,
            container.Capacity,
            container.LocationX,
            container.LocationY,
            TrashType = (int)container.TrashType,
            Status    = (int)container.Status,
            container.HasSensor,
            container.Temperature,
            container.BatteryPercentage
        };

        await hubContext.Clients.All.SendAsync("ContainerAdded", payload);

        return CreatedAtAction(nameof(GetById), new { id = container.Id }, payload);
    }

    private static double HaversineMeters(
        double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6_371_000.0; // Earth radius in meters
        double dLat = (lat2 - lat1) * Math.PI / 180.0;
        double dLng = (lng2 - lng1) * Math.PI / 180.0;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(lat1 * Math.PI / 180.0) *
                   Math.Cos(lat2 * Math.PI / 180.0) *
                   Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return 2 * R * Math.Asin(Math.Min(1.0, Math.Sqrt(a)));
    }

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
                Id  = id,
                FillPercentage = 0.0,
                Temperature  = container.Temperature,
                BatteryPercentage = container.BatteryPercentage,
                Status = (int)TrashContainerStatus.Active
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
        [FromServices] IHubContext<ContainerHub> hubContext,
        [FromServices] IExternalWeatherService weather)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var container = await _containerRepo.GetByIdAsync(id);
        if (container is null)
            return NotFound();

        var sensorJustEnabled = dto.HasSensor && !container.HasSensor;

        container.FillPercentage = dto.FillPercentage;
        container.Status = dto.Status;

        if (!string.IsNullOrWhiteSpace(dto.AreaId) && dto.AreaId != container.AreaId)
        {
            var areaExists = await _areaRepo.GetByIdAsync(dto.AreaId) is not null;
            if (!areaExists)
                return BadRequest($"AreaId '{dto.AreaId}' does not exist.");
            container.AreaId = dto.AreaId;
        }

        if (dto.HasSensor)
        {
            container.HasSensor = true;
            container.BatteryPercentage = dto.BatteryPercentage ?? container.BatteryPercentage ?? 100;

            if (sensorJustEnabled || container.Temperature is null)
            {
                try
                {
                    container.Temperature = await weather.GetAmbientTemperatureAsync(
                        container.LocationX, container.LocationY) ?? 20.0;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Could not fetch ambient temp for container {Id}; using fallback.", id);
                    container.Temperature = 20.0;
                }
            }
        }
        else
        {
            container.HasSensor = false;
            container.BatteryPercentage = null;
            container.Temperature  = null;
        }

        await _containerRepo.UpdateAsync(container);

        await hubContext.Clients.All.SendAsync("ContainersUpdated", new[]
        {
            new
            {
                Id = id,
                FillPercentage= dto.FillPercentage,
                Temperature  = container.Temperature,
                BatteryPercentage = container.BatteryPercentage,
                HasSensor  = container.HasSensor,
                Status = (int)dto.Status
            }
        });

        return NoContent();
    }
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        [FromRoute] int id,
        [FromServices] BinMaps.Data.BinMapsDbContext db,
        [FromServices] IHubContext<ContainerHub> hubContext)
    {
        var container = await db.TrashContainers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == id);
        if (container is null) return NotFound();
        if (container.IsDeleted)
            return BadRequest(new { message = "Контейнерът вече е изтрит." });

        container.IsDeleted = true;
        container.DeletedAt = DateTime.UtcNow;
        container.DeletedByUserId = User.Identity?.Name;
        await db.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {Actor} archived container #{Id} (seeded={Seeded})",
            User.Identity?.Name ?? "unknown", id, container.IsSeeded);

        await hubContext.Clients.All.SendAsync("ContainerRemoved", new { id });

        return Ok(new { id, mode = "soft", isSeeded = container.IsSeeded });
    }

    #endregion
}