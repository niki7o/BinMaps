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
        run.Status = outcome == "cancelled" ? RouteRunStatus.Cancelled : RouteRunStatus.Completed;
        run.CompletedAt = DateTime.UtcNow;
        run.StopsCompleted = Math.Max(0, dto.StopsCompleted);
        run.CollectedLoad = Math.Max(0, dto.CollectedLoad);

        return await _repo.UpdateAsync(run);
    }

    #endregion

    #region Admin reads

    public async Task<IReadOnlyList<RouteRunSummaryDto>> GetHistoryAsync(
        string? driverId = null,
        string? areaId = null,
        string? status = null,
        int take = 100)
    {
        if (take <= 0) take = 100;
        if (take > 500) take = 500;

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

            var rows = await query
                .OrderByDescending(r => r.StartedAt)
                .Take(take)
                .ToListAsync();

            return rows.Select(ToSummary).ToList();
        }
        catch (Exception ex)
        {
            // Most common cause on a fresh deploy: "Invalid object name 'RouteRuns'"
            // because the migration hasn't been applied yet. Return an empty list
            // so the admin dashboard stays usable instead of showing 500.
            _logger.LogError(ex, "GetHistoryAsync failed — returning empty list");
            return Array.Empty<RouteRunSummaryDto>();
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
            TrashType = run.TrashType,
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
        TrashType = r.TrashType,
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
