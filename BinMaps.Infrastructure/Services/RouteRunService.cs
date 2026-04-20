using System.Text.Json;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Infrastructure.Services;

public sealed class RouteRunService : IRouteRunService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly IRepository<RouteRun, int> _repo;

    public RouteRunService(IRepository<RouteRun, int> repo)
    {
        _repo = repo;
    }

    #region Start / Complete

    public async Task<int> StartAsync(string driverId, string driverName, StartRouteRunDto dto)
    {
        if (string.IsNullOrWhiteSpace(driverId))
            throw new ArgumentException("driverId is required", nameof(driverId));
        if (string.IsNullOrWhiteSpace(dto.AreaId))
            throw new ArgumentException("areaId is required", nameof(dto));

        var run = new RouteRun
        {
            DriverId = driverId,
            DriverName = driverName ?? string.Empty,
            AreaId = dto.AreaId,
            TrashType = dto.TrashType,
            TruckId = dto.TruckId,
            PlannedDistanceKm = dto.PlannedDistanceKm,
            PlannedMinutes = dto.PlannedMinutes,
            StopsPlanned = dto.StopsPlanned,
            StartedAt = DateTime.UtcNow,
            Status = RouteRunStatus.Active,
            StopsJson = dto.Stops is { Count: > 0 }
                ? JsonSerializer.Serialize(dto.Stops, JsonOpts)
                : null,
        };

        await _repo.AddAsync(run);
        return run.Id;
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

    public async Task<RouteRunDetailDto?> GetByIdAsync(int runId)
    {
        var run = await _repo.GetByIdAsync(runId);
        if (run is null) return null;

        var stops = new List<RouteStopSnapshotDto>();
        if (!string.IsNullOrWhiteSpace(run.StopsJson))
        {
            try
            {
                stops = JsonSerializer.Deserialize<List<RouteStopSnapshotDto>>(run.StopsJson!, JsonOpts)
                        ?? new List<RouteStopSnapshotDto>();
            }
            catch
            {
                // Corrupt JSON in legacy rows shouldn't blow the admin page.
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
