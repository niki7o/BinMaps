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

        // Fetch from DB with the raw entity shape first (EF can't translate
        // enum-to-int casts in SQL projections reliably), then convert in memory.
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

        // ── 1. Region bounds check ─────────────────────────────────────
        var bounds = _configuration.GetSection("Region:Bounds");
        double? south = bounds.GetValue<double?>("South");
        double? west = bounds.GetValue<double?>("West");
        double? north = bounds.GetValue<double?>("North");
        double? east = bounds.GetValue<double?>("East");

        // Only apply bounds check when all four sides are configured.
        // This way the endpoint is still usable in test environments
        // without region config, while production stays guarded.
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

        // ── 2. Area exists ─────────────────────────────────────────────
        var area = await _areaRepo.GetByIdAsync(dto.AreaId);
        if (area is null)
        {
            return Problem(
                title: "Area not found",
                detail: $"AreaId '{dto.AreaId}' does not exist.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        // ── 3. Duplicate / too-close check ─────────────────────────────
        double minDistanceMeters = _configuration
            .GetSection("Region")
            .GetValue<double?>("MinContainerDistanceMeters") ?? 15.0;

        // Pre-filter with a cheap bounding box (rough degree conversion
        // sufficient at Sofia latitude) to avoid fetching every row, then
        // compute the exact haversine in memory for candidates.
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

        // ── 4. Persist ────────────────────────────────────────────────
        // The TrashContainer entity is configured with ValueGeneratedNever()
        // (BinMapsDbContext line 47), so we must assign Id ourselves —
        // otherwise EF defaults to 0 and we end up with "#0" containers.
        //
        // Strategy: pick the LOWEST missing positive integer (first-fit).
        // The previous strategy was MAX(Id)+1, which left permanent gaps
        // when a hard-delete punched a hole in the sequence. First-fit
        // reuses those gaps so:
        //   • An admin who hard-deleted a seeded container (e.g. #1) can
        //     re-add a replacement and it will *land back at #1*, not at
        //     the end of the table — which is what the user actually wants
        //     when "restoring" a seeded row through the UI.
        //   • Soft-deleted rows still occupy their id (we read with
        //     IgnoreQueryFilters), so they will NOT be reused — restoring
        //     a soft-deleted bin is a separate flow (UPDATE IsDeleted=0).
        // Cost: O(n) memory for the id list. n ≈ a few thousand at most;
        // negligible. The DB-side alternative (a self-LEFT-JOIN gap query)
        // doesn't translate cleanly through EF and isn't worth the risk.
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
            if (id != nextId) break;   // gap found — nextId is the missing slot
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

        // ── 5. Audit log ──────────────────────────────────────────────
        string actor = User.Identity?.Name ?? "unknown";
        _logger.LogInformation(
            "Admin {Actor} created container #{Id} in area {Area} at ({Lat:F5},{Lng:F5}) type={Type} sensor={Sensor}",
            actor, container.Id, container.AreaId,
            container.LocationY, container.LocationX,
            container.TrashType, container.HasSensor);

        // ── 6. Broadcast via SignalR ──────────────────────────────────
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

        if (dto.HasSensor)
        {
            container.HasSensor = true;
            // Preserve existing battery when not explicitly provided.
            // Defaulting to 100 only for truly new/null sensors avoids
            // accidentally resetting a partially-drained battery on every edit.
            container.BatteryPercentage = dto.BatteryPercentage ?? container.BatteryPercentage ?? 100;

            // Pull a fresh ambient reading so the row immediately shows a
            // real temperature instead of waiting up to 60s for the next
            // background cycle. If the API call fails we fall back to a
            // sensible default rather than blocking the admin's edit.
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

    /// <summary>
    /// Soft-deletes a container (seeded or user-added). The row is hidden from
    /// the map via the global query filter and shows up in the admin's
    /// "Архивирани" tab where it can be restored or removed permanently via
    /// the AdminController's /permanent endpoint.
    /// </summary>
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

        // Tell every connected client to drop this marker from the map.
        await hubContext.Clients.All.SendAsync("ContainerRemoved", new { id });

        return Ok(new { id, mode = "soft", isSeeded = container.IsSeeded });
    }

    #endregion
}