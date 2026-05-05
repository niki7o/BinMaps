using System.Security.Claims;
using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/trucks")]
[Authorize(Roles = "Driver,Admin")]
[Produces("application/json")]
public sealed class TrucksController : ControllerBase
{
    private readonly ITruckRouteService _routeService;
    private readonly IRouteRunService _routeRunService;
    private readonly ILogger<TrucksController> _logger;

    public TrucksController(
        ITruckRouteService routeService,
        IRouteRunService routeRunService,
        ILogger<TrucksController> logger)
    {
        _routeService = routeService;
        _routeRunService = routeRunService;
        _logger = logger;
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
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> StartRun([FromBody] StartRouteRunDto? dto)
    {
        if (dto is null)
            return BadRequest(new { message = "Тялото на заявката липсва или е невалидно." });

        var driverId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var driverName = User.Identity?.Name ?? string.Empty;
        if (string.IsNullOrWhiteSpace(driverId))
            return Unauthorized();

        try
        {
            var id = await _routeRunService.StartAsync(driverId, driverName, dto);
            return Ok(new { runId = id });
        }
        catch (RouteAlreadyActiveException ex)
        {
            // Another driver already holds this (area, trashType). Return a
            // structured 409 the truck app can render as "Зает от Иван — преди 12 мин."
            _logger.LogInformation(
                "StartRun blocked for {DriverId} — already held by {Holder} (run #{RunId}).",
                driverId, ex.LockedByDriverId, ex.ExistingRunId);
            return Conflict(new
            {
                message            = "Маршрутът вече е стартиран от друг шофьор.",
                lockedByDriverId   = ex.LockedByDriverId,
                lockedByDriverName = ex.LockedByDriverName,
                existingRunId      = ex.ExistingRunId,
                startedAt          = ex.StartedAt,
            });
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "StartRun validation failed for driver {DriverId}", driverId);
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateException ex)
        {
            // DbUpdateException at SaveChanges-time is a server-side
            // problem (FK violations, schema drift, DB unreachable), not
            // bad client input. Honest 503 so monitoring/alerting picks
            // it up — was previously a 400 which obscured infrastructure
            // issues as user errors.
            _logger.LogError(ex,
                "StartRun DB error for driver {DriverId}, areaId={AreaId}, truckId={TruckId}",
                driverId, dto.AreaId, dto.TruckId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Базата данни не е достъпна в момента. Опитайте след малко.",
                detail = ex.InnerException?.Message ?? ex.Message,
            });
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            // Raw SQL errors that bypass DbUpdateException (e.g. queries
            // we run before the SaveChanges path, like the lock check).
            // Same 503 treatment for the same reason.
            _logger.LogError(ex,
                "StartRun SQL error for driver {DriverId}, areaId={AreaId}, truckId={TruckId}",
                driverId, dto.AreaId, dto.TruckId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Грешка в базата данни. Опитайте след малко.",
                detail = ex.Message,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "StartRun unexpected error for driver {DriverId}", driverId);
            return StatusCode(500, new { message = "Неочаквана грешка при стартиране." });
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
        try
        {
            var list = await _routeRunService.GetHistoryAsync(driverId, areaId, status, take);
            return Ok(list);
        }
        catch (Exception ex)
        {
            // Log and return an empty list rather than 500, so the admin dashboard
            // can render cleanly even if the RouteRuns table isn't there yet
            // (e.g. fresh deploy where the migration hasn't finished).
            _logger.LogError(ex, "GetHistory failed — returning empty list");
            return Ok(Array.Empty<RouteRunSummaryDto>());
        }
    }

    /// <summary>Full detail of a single run (admin only).</summary>
    [HttpGet("route/{id:int}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(RouteRunDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetRun(int id)
    {
        try
        {
            var detail = await _routeRunService.GetByIdAsync(id);
            return detail is null
                ? NotFound(new { message = "Маршрутът не е намерен." })
                : Ok(detail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetRun({Id}) failed", id);
            return NotFound(new { message = "Маршрутът не е достъпен." });
        }
    }

    /// <summary>
    /// Snapshot of currently-active route runs with last-known driver
    /// position (if any). Used by every client on connect/return-to-tab so
    /// trucks are immediately visible without waiting up to a full broadcast
    /// cycle. Open to any authenticated user — payload is just truck
    /// telemetry, no PII beyond display name.
    /// </summary>
    [HttpGet("route/active")]
    [Authorize] // overrides class-level [Authorize(Roles="Driver,Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetActiveRuns(
        [FromServices] BinMapsDbContext db,
        [FromServices] LiveDriverTracker tracker)
    {
        try
        {
            // 1. Active runs (DB is the source of truth — covers fresh server
            //    boots where the in-memory tracker is still empty).
            var runs = await db.Set<RouteRun>()
                .AsNoTracking()
                .Where(r => r.Status == RouteRunStatus.Active)
                .Select(r => new
                {
                    r.Id,
                    r.DriverId,
                    r.DriverName,
                    r.AreaId,
                    r.TrashType,
                    r.TruckId,
                    r.StartedAt,
                    r.PlannedDistanceKm,
                    r.PlannedMinutes,
                    r.StopsPlanned,
                })
                .ToListAsync();

            if (runs.Count == 0)
                return Ok(Array.Empty<object>());

            // 2. Truck details (plate, capacity) so the live panel can show
            //    a real "load / capacity" bar instead of just litres.
            var truckIds = runs.Where(r => r.TruckId.HasValue)
                               .Select(r => r.TruckId!.Value)
                               .Distinct()
                               .ToList();

            var trucks = truckIds.Count == 0
                ? new Dictionary<int, (string plate, double capacity)>()
                : await db.Trucks
                    .AsNoTracking()
                    .Where(t => truckIds.Contains(t.Id))
                    .ToDictionaryAsync(
                        t => t.Id,
                        t => (t.LicensePlate, t.Capacity));

            // 3. Live positions cached in-memory (may be empty if drivers
            //    haven't broadcast yet after a server restart — that's fine).
            var positions = tracker.Snapshot()
                .ToDictionary(p => p.DriverId, StringComparer.Ordinal);

            var result = runs.Select(r =>
            {
                positions.TryGetValue(r.DriverId, out var p);
                (string plate, double capacity)? truck = null;
                if (r.TruckId is int tid && trucks.TryGetValue(tid, out var t))
                    truck = t;

                return new
                {
                    runId             = r.Id,
                    driverId          = r.DriverId,
                    driverName        = r.DriverName,
                    areaId            = r.AreaId,
                    trashType         = (int)r.TrashType,
                    startedAt         = r.StartedAt,
                    plannedDistanceKm = r.PlannedDistanceKm,
                    plannedMinutes    = r.PlannedMinutes,
                    stopsPlanned      = r.StopsPlanned,
                    truck = truck is null ? null : new
                    {
                        id       = r.TruckId,
                        plate    = truck.Value.plate,
                        capacity = truck.Value.capacity,
                    },
                    lastPosition = p is null ? null : new
                    {
                        lat        = p.Lat,
                        lng        = p.Lng,
                        heading    = p.Heading,
                        speedKmh   = p.SpeedKmh,
                        stopIndex  = p.StopIndex,
                        totalStops = p.TotalStops,
                        load       = p.Load,
                        phase      = p.Phase,
                        at         = p.At,
                    },
                };
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetActiveRuns failed — returning empty list.");
            return Ok(Array.Empty<object>());
        }
    }

    #endregion
}
