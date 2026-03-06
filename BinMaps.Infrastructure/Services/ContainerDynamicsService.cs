using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BinMaps.Infrastructure.Services;

public sealed class ContainerDynamicsService : BackgroundService
{
    private static readonly TimeSpan UpdateInterval = TimeSpan.FromSeconds(10);
    private const int BatchSize = 50;
    private const double SofiaLat = 42.6977;
    private const double SofiaLng = 23.3219;
    private const double FallbackAmbient = 20.0;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<ContainerHub> _hubContext;
    private readonly ILogger<ContainerDynamicsService> _logger;

    public ContainerDynamicsService(
        IServiceScopeFactory scopeFactory,
        IHubContext<ContainerHub> hubContext,
        ILogger<ContainerDynamicsService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await RunCycleAsync(stoppingToken);
            await Task.Delay(UpdateInterval, stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken token)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();
            var weather = scope.ServiceProvider.GetRequiredService<IExternalWeatherService>();
            var simulator = scope.ServiceProvider.GetRequiredService<FillageSimulator>();

            var ambientTemp = await ResolveAmbientAsync(weather);

            var containers = await db.TrashContainers
                .Include(c => c.Area)
                .ToListAsync(token);

            foreach (var c in containers)
                ApplyUpdates(c, simulator, ambientTemp);

            await SaveBatchedAsync(db, containers, token);
            await BroadcastAsync(containers, token);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Container dynamics cycle failed.");
        }
    }

    private static async Task<double> ResolveAmbientAsync(IExternalWeatherService weather)
    {
        try
        {
            return await weather.GetAmbientTemperatureAsync(SofiaLat, SofiaLng) ?? FallbackAmbient;
        }
        catch
        {
            return FallbackAmbient;
        }
    }

    private static void ApplyUpdates(TrashContainer container, FillageSimulator simulator, double ambientTemp)
    {
        var zoneMultiplier = container.Area?.FillMultiplier ?? 1.0;

        container.FillPercentage = Math.Clamp(
            container.FillPercentage + simulator.CalculateFillIncrement(container, zoneMultiplier),
            0, 100);

        if (container.HasSensor && container.Status != TrashContainerStatus.SensorBroken)
        {
            if (container.Temperature == null)
            {
                container.Temperature = ambientTemp;
            }
            else
            {
                container.Temperature = simulator.SimulateTemperature(container, ambientTemp);
            }

            if (container.BatteryPercentage == null || container.BatteryPercentage == 0)
            {
                container.BatteryPercentage = 100;
            }
            else
            {
                container.BatteryPercentage = Math.Max(0, container.BatteryPercentage.Value - FillageSimulator.CalculateBatteryDrain(container));
            }
        }
        else
        {
            container.Temperature = null;
        }

        // Offline is set only by approved ContainerDamage reports and cleared only by
        // an explicit admin/driver action (e.g. emptying). Never auto-clear it.
        if (container.Status == TrashContainerStatus.Offline)
            return;

        var newStatus = FillageSimulator.DetermineStatus(container);

        // Auto-set Fire/SensorBroken when sensors confirm the condition.
        // Auto-clear Fire/SensorBroken ONLY when sensors confirm the condition has passed
        // AND the status was sensor-detected (not manually approved via a report).
        // To keep it simple: only clear if DetermineStatus explicitly says Active,
        // meaning neither fire nor battery conditions are met.
        container.Status = newStatus;
    }

    private static async Task SaveBatchedAsync(BinMapsDbContext db, List<TrashContainer> containers, CancellationToken token)
    {
        for (int i = 0; i < containers.Count; i += BatchSize)
        {
            foreach (var c in containers.Skip(i).Take(BatchSize))
            {
                var entry = db.Entry(c);
                entry.Property(x => x.FillPercentage).IsModified = true;
                entry.Property(x => x.Temperature).IsModified = true;
                entry.Property(x => x.BatteryPercentage).IsModified = true;
                // Only persist the status column for non-Offline containers.
                // Offline is owned by report approval; the dynamics cycle must not touch it.
                if (c.Status != TrashContainerStatus.Offline)
                    entry.Property(x => x.Status).IsModified = true;
            }
            await db.SaveChangesAsync(token);
        }
    }

    private async Task BroadcastAsync(List<TrashContainer> containers, CancellationToken token)
    {
        var payload = containers.Select(c => new
        {
            c.Id,
            c.FillPercentage,
            c.Temperature,
            c.BatteryPercentage,
            Status = (int?)c.Status
        });
        await _hubContext.Clients.All.SendAsync("ContainersUpdated", payload, token);
    }
}