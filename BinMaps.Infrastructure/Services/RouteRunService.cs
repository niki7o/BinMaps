using System.Text.Json;
using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BinMaps.Infrastructure.Services;

public sealed class RouteRunService : IRouteRunService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly IRepository<RouteRun, int> _repo;
    private readonly BinMapsDbContext _db;
    private readonly ILogger<RouteRunService> _logger;

    public RouteRunService(
        IRepository<RouteRun, int> repo,
        BinMapsDbContext db,
        ILogger<RouteRunService> logger)
    {
        _repo = repo;
        _db = db;
        _logger = logger;
    }

    #region Start / Complete

    public async Task<int> StartAsync(string driverId, string driverName, StartRouteRunDto dto)
    {
        if (string.IsNullOrWhiteSpace(driverId))
            throw new ArgumentException("driverId е задължителен.", nameof(driverId));
        if (dto is null)
            throw new ArgumentException("Тялото на заявката е празно.", nameof(dto));
        if (string.IsNullOrWhiteSpace(dto.AreaId))
            throw new ArgumentException("areaId е задължителен.", nameof(dto));

        // Verify the area exists — a missing FK would otherwise surface as a
        // cryptic DbUpdateException at SaveChanges. Catch it here with a clear
        // 400 message instead.
        var areaExists = await _db.Areas
            .AsNoTracking()
            .AnyAsync(a => a.Id == dto.AreaId);
        if (!areaExists)
            throw new ArgumentException(
                $"Зоната \"{dto.AreaId}\" не съществува.", nameof(dto));

        // Truck is optional, but if supplied it must exist.
        if (dto.TruckId is int tid)
        {
            var truckExists = await _db.Trucks
                .AsNoTracking()
                .AnyAsync(t => t.Id == tid);
            if (!truckExists)
                throw new ArgumentException(
                    $"Камионът с id={tid} не съществува.", nameof(dto));
        }

        // ── Concurrency lock ─────────────────────────────────────────────
        // Only one Active run per (AreaId, TrashType) at a time. A second
        // driver trying to start the same route gets a 409 with the holder's
        // name + start time so the truck app can show "Зает от Иван — преди
        // 12 мин." instead of silently competing.
        //
        // A driver re-starting *their own* active run is allowed to fall
        // through (idempotent retry); we don't throw in that case — instead
        // we return the existing runId so the client converges.
        //
        // ⚠ Fail open: if the lock query itself errors (transient DB blip,
        // schema drift on a fresh deploy where the migration hasn't fully
        // applied, etc.) we LOG and proceed to insert. The alternative —
        // 500'ing every start-route call when the lock is unavailable —
        // is much worse than a vanishingly-rare double-start, which the
        // truck app already handles defensively at the navigation layer.
        RouteRun? existingActive = null;
        try
        {
            existingActive = await _repo.GetAllAttached()
                .AsNoTracking()
                .Where(r => r.Status == RouteRunStatus.Active
                         && r.AreaId   == dto.AreaId
                         && r.TrashType == dto.TrashType)
                .OrderBy(r => r.StartedAt)
                .FirstOrDefaultAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "StartAsync lock check failed (areaId={AreaId}, trashType={TrashType}); proceeding without lock.",
                dto.AreaId, dto.TrashType);
        }

        if (existingActive is not null)
        {
            var staleThreshold = DateTime.UtcNow.AddHours(-6);
            if (existingActive.StartedAt < staleThreshold)
            {
                try
                {
                    var trackedRun = await _repo.GetByIdAsync(existingActive.Id);
                    if (trackedRun?.Status == RouteRunStatus.Active)
                    {
                        trackedRun.Status = RouteRunStatus.Cancelled;
                        trackedRun.CompletedAt = DateTime.UtcNow;
                        await _repo.UpdateAsync(trackedRun);
                        _logger.LogInformation(
                            "Auto-expired stale run #{RunId} for area '{AreaId}' (started {StartedAt:u}, driver {DriverName}).",
                            existingActive.Id, existingActive.AreaId, existingActive.StartedAt, existingActive.DriverName);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-expire stale run #{RunId}.", existingActive.Id);
                }
            }
            else if (string.Equals(existingActive.DriverId, driverId, StringComparison.Ordinal))
            {
                return existingActive.Id;
            }
            else
            {
                throw new RouteAlreadyActiveException(
                    existingActive.Id,
                    existingActive.DriverId,
                    existingActive.DriverName,
                    existingActive.StartedAt);
            }
        }

        var run = new RouteRun
        {
            DriverId = driverId,
            DriverName = driverName ?? string.Empty,
            AreaId = dto.AreaId,
            TrashType = dto.TrashType,
            TruckId = dto.TruckId,
            PlannedDistanceKm = Math.Max(0, dto.PlannedDistanceKm),
            PlannedMinutes = Math.Max(0, dto.PlannedMinutes),
            StopsPlanned = Math.Max(0, dto.StopsPlanned),
            StartedAt = DateTime.UtcNow,
            Status = RouteRunStatus.Active,
            StopsJson = SerialiseStopsSafely(dto.Stops),
        };

        await _repo.AddAsync(run);
        return run.Id;
    }

    private static string? SerialiseStopsSafely(List<RouteStopSnapshotDto>? stops)
    {
        if (stops is not { Count: > 0 }) return null;
        try
        {
            return JsonSerializer.Serialize(stops, JsonOpts);
        }
        catch
        {
            // A weird stop shouldn't prevent the run from starting.
            return null;
        }
    }

    public async Task<bool> CompleteAsync(int runId, string driverId, CompleteRouteRunDto dto)
    {
        var run = await _repo.GetByIdAsync(runId);
        if (run is null) return false;

        if (!string.Equals(run.DriverId, driverId, StringComparison.Ordinal))
            return false;

        if (run.Status != RouteRunStatus.Active)
            return true;

        var outcome = (dto.Outcome ?? "completed").Trim().ToLowerInvariant();
        var cancelled = outcome == "cancelled";

        run.Status = cancelled ? RouteRunStatus.Cancelled : RouteRunStatus.Completed;
        run.CompletedAt = DateTime.UtcNow;
        run.StopsCompleted = Math.Max(0, dto.StopsCompleted);
        run.CollectedLoad = Math.Max(0, dto.CollectedLoad);

        var saved = await _repo.UpdateAsync(run);

        // On a successful completion (not a cancellation), reset the
        // fill % of every container that was visited. Without this the
        // background simulator and route generator both still see the
        // pre-collection fills and the driver can immediately re-run the
        // same route. We do this server-side so it cannot be skipped by
        // a flaky network request from the truck app.
        if (saved && !cancelled)
            await EmptyVisitedContainersAsync(run, dto);

        return saved;
    }

    private async Task EmptyVisitedContainersAsync(RouteRun run, CompleteRouteRunDto dto)
    {
        // Two sources of truth for which containers were actually visited:
        //   (1) dto.VisitedContainerIds — explicit list from the truck app
        //   (2) the saved StopsJson snapshot, capped to StopsCompleted
        // (1) is preferred when present, (2) is the safe fallback so this
        // works even if the frontend doesn't supply the list.
        IReadOnlyList<int> ids = Array.Empty<int>();

        if (dto.VisitedContainerIds is { Count: > 0 } explicitIds)
        {
            ids = explicitIds.Where(id => id > 0).Distinct().ToList();
        }
        else if (!string.IsNullOrWhiteSpace(run.StopsJson))
        {
            try
            {
                var stops = JsonSerializer.Deserialize<List<RouteStopSnapshotDto>>(
                    run.StopsJson!, JsonOpts) ?? new();
                ids = stops
                    .Take(Math.Max(0, run.StopsCompleted))
                    .Select(s => s.Id)
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList();
            }
            catch
            {
                // StopsJson was somehow malformed — bail out silently.
                ids = Array.Empty<int>();
            }
        }

        if (ids.Count == 0) return;

        try
        {
            var containers = await _db.TrashContainers
                .Where(c => ids.Contains(c.Id))
                .ToListAsync();

            foreach (var c in containers)
            {
                // Tiny non-zero residual prevents "exactly 0%" snapping that
                // looks fake; matches the 1-5% jitter the truck app already
                // applied locally. Real-world parallel: even after pickup, a
                // few liters of residue stay in the bin.
                c.FillPercentage = Math.Round(Random.Shared.NextDouble() * 4 + 1, 1);
            }

            await _db.SaveChangesAsync();
            _logger.LogInformation(
                "Route {RunId} completed: emptied {Count} containers.",
                run.Id, containers.Count);
        }
        catch (Exception ex)
        {
            // Don't fail the whole completion call if cleanup fails — the
            // run was already persisted successfully.
            _logger.LogWarning(ex,
                "Route {RunId} completed but emptying containers failed.", run.Id);
        }
    }

    #endregion

    #region Admin reads

    public async Task<(IReadOnlyList<RouteRunSummaryDto> Items, int Total)> GetHistoryAsync(
        string? driverId = null,
        string? areaId = null,
        string? status = null,
        int skip = 0,
        int take = 20)
    {
        if (skip < 0)  skip = 0;
        if (take <= 0) take = 20;
        if (take > 200) take = 200;

        try
        {
            var query = _repo.GetAllAttached().AsNoTracking();

            if (!string.IsNullOrWhiteSpace(driverId))
                query = query.Where(r => r.DriverId == driverId);

            if (!string.IsNullOrWhiteSpace(areaId))
                query = query.Where(r => r.AreaId == areaId);

            if (!string.IsNullOrWhiteSpace(status)
                && Enum.TryParse<RouteRunStatus>(status, true, out var parsed))
            {
                query = query.Where(r => r.Status == parsed);
            }

            var ordered = query.OrderByDescending(r => r.StartedAt);
            var total = await ordered.CountAsync();
            var rows  = await ordered.Skip(skip).Take(take).ToListAsync();

            return (rows.Select(ToSummary).ToList(), total);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetHistoryAsync failed");
            return (Array.Empty<RouteRunSummaryDto>(), 0);
        }
    }

    public async Task<bool> CancelAsync(int runId)
    {
        var run = await _repo.GetByIdAsync(runId);
        if (run is null) return false;
        if (run.Status != RouteRunStatus.Active) return true;

        run.Status = RouteRunStatus.Cancelled;
        run.CompletedAt = DateTime.UtcNow;
        return await _repo.UpdateAsync(run);
    }

    public async Task<bool> DeleteAsync(int runId)
    {
        try
        {
            var run = await _repo.GetByIdAsync(runId);
            if (run is null) return false;
            return await _repo.DeleteAsync(run);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DeleteAsync({RunId}) failed", runId);
            return false;
        }
    }

    public async Task<RouteRunDetailDto?> GetByIdAsync(int runId)
    {
        RouteRun? run;
        try
        {
            run = await _repo.GetByIdAsync(runId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetByIdAsync({RunId}) failed", runId);
            return null;
        }
        if (run is null) return null;

        var stops = new List<RouteStopSnapshotDto>();
        if (!string.IsNullOrWhiteSpace(run.StopsJson))
        {
            try
            {
                stops = JsonSerializer.Deserialize<List<RouteStopSnapshotDto>>(
                            run.StopsJson!, JsonOpts)
                        ?? new List<RouteStopSnapshotDto>();
            }
            catch
            {
                stops = new List<RouteStopSnapshotDto>();
            }
        }

        return new RouteRunDetailDto
        {
            Id = run.Id,
            DriverId = run.DriverId,
            DriverName = run.DriverName,
            AreaId = run.AreaId,
            TrashType = (int)run.TrashType,
            TruckId = run.TruckId,
            StartedAt = run.StartedAt,
            CompletedAt = run.CompletedAt,
            Status = run.Status.ToString(),
            PlannedDistanceKm = run.PlannedDistanceKm,
            PlannedMinutes = run.PlannedMinutes,
            CollectedLoad = run.CollectedLoad,
            StopsCompleted = run.StopsCompleted,
            StopsPlanned = run.StopsPlanned,
            DurationMinutes = DurationMinutes(run),
            Stops = stops,
        };
    }

    #endregion

    #region Mapping

    private static RouteRunSummaryDto ToSummary(RouteRun r) => new()
    {
        Id = r.Id,
        DriverId = r.DriverId,
        DriverName = r.DriverName,
        AreaId = r.AreaId,
        TrashType = (int)r.TrashType,
        TruckId = r.TruckId,
        StartedAt = r.StartedAt,
        CompletedAt = r.CompletedAt,
        Status = r.Status.ToString(),
        PlannedDistanceKm = r.PlannedDistanceKm,
        PlannedMinutes = r.PlannedMinutes,
        CollectedLoad = r.CollectedLoad,
        StopsCompleted = r.StopsCompleted,
        StopsPlanned = r.StopsPlanned,
        DurationMinutes = DurationMinutes(r),
    };

    private static double DurationMinutes(RouteRun r)
    {
        if (r.CompletedAt is null) return 0;
        var diff = r.CompletedAt.Value - r.StartedAt;
        return Math.Round(diff.TotalMinutes, 2);
    }

    #endregion
}

/// <summary>
/// Thrown when a driver tries to start a route on an (area, trashType) pair
/// that another driver is already running. Carries the holder's identity so
/// the API can return a structured 409 the truck app can render directly.
/// </summary>
public sealed class RouteAlreadyActiveException : Exception
{
    public int       ExistingRunId   { get; }
    public string    LockedByDriverId { get; }
    public string    LockedByDriverName { get; }
    public DateTime  StartedAt        { get; }

    public RouteAlreadyActiveException(
        int existingRunId,
        string lockedByDriverId,
        string lockedByDriverName,
        DateTime startedAt)
        : base($"Route is already active (run #{existingRunId}, driver {lockedByDriverName}).")
    {
        ExistingRunId      = existingRunId;
        LockedByDriverId   = lockedByDriverId;
        LockedByDriverName = lockedByDriverName;
        StartedAt          = startedAt;
    }
}
