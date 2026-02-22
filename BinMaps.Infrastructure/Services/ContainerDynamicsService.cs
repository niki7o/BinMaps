using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BinMaps.Infrastructure.Services;

public sealed class ContainerDynamicsService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IHubContext<ContainerHub> _hubContext;
    private readonly FillageSimulator _simulator;
    private readonly ILogger<ContainerDynamicsService> _logger;
    private readonly Random _random = new();

    private const int CycleMs = 10_000;
    private const int BatchSize = 50;

    public ContainerDynamicsService(
        IServiceProvider serviceProvider,
        IHubContext<ContainerHub> hubContext,
        ILogger<ContainerDynamicsService> logger)
    {
        _serviceProvider = serviceProvider;
        _hubContext = hubContext;
        _logger = logger;
        _simulator = new FillageSimulator();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(2_000, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ContainerDynamicsService cycle faulted.");
            }

            await Task.Delay(CycleMs, stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();

        var containers = await context.TrashContainers
            .Include(tc => tc.Area)
            .AsNoTracking()
            .ToListAsync(ct);

        if (containers.Count == 0) return;

        foreach (var container in containers)
            ApplyDynamics(container);

        await SaveInBatchesAsync(context, containers, ct);

        var payload = containers.Select(c => new
        {
            c.Id,
            c.AreaId,
            c.FillPercentage,
            c.Temperature,
            c.BatteryPercentage,
            Status = c.Status.ToString()
        });

        await _hubContext.Clients.All.SendAsync("ContainersUpdated", payload, ct);

        _logger.LogDebug(
            "Cycle: {Count} containers updated, avg fill {Avg:F1}%",
            containers.Count,
            containers.Average(c => c.FillPercentage));
    }

    private void ApplyDynamics(TrashContainer container)
    {
        var zoneMultiplier = container.Area?.ZoneMultiplier ?? 1.0;

        if (container.FillPercentage >= 100)
        {
            container.FillPercentage = _simulator.GetEmptyFillLevel();
            container.LastEmptiedAt = DateTime.UtcNow;
            if (container.HasSensor) container.Temperature = 15 + _random.NextDouble() * 5;
        }
        else
        {
            container.FillPercentage = Math.Min(99.9,
                container.FillPercentage + _simulator.CalculateFillIncrement(container, zoneMultiplier));
        }

        if (container.HasSensor)
        {
            container.Temperature = _simulator.SimulateTemperature(container);
            container.LastSensorReadAt = DateTime.UtcNow;

            if (container.BatteryPercentage.HasValue)
                container.BatteryPercentage = Math.Max(0,
                    container.BatteryPercentage.Value - _simulator.CalculateBatteryDrain(container));
        }

        container.Status = FillageSimulator.DetermineStatus(container);
    }

    private static async Task SaveInBatchesAsync(BinMapsDbContext context, List<TrashContainer> containers, CancellationToken ct)
    {
        var batches = (int)Math.Ceiling(containers.Count / (double)BatchSize);

        for (var i = 0; i < batches; i++)
        {
            var batch = containers.Skip(i * BatchSize).Take(BatchSize).ToList();

            foreach (var c in batch)
                context.Entry(c).State = EntityState.Modified;

            await context.SaveChangesAsync(ct);

            foreach (var c in batch)
                context.Entry(c).State = EntityState.Detached;
        }
    }
}