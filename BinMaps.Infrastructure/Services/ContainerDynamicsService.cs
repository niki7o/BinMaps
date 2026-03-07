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
    private const double SofiaLng  = 23.3219;
    private const double FallbackAmbient = 20.0;
    private const double LowBatteryThreshold = 20.0;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<ContainerHub> _hubContext;
    private readonly ILogger<ContainerDynamicsService> _logger;

    private readonly HashSet<int> _lowBatteryNotified = new();

    public ContainerDynamicsService(
        IServiceScopeFactory scopeFactory,
        IHubContext<ContainerHub> hubContext,
        ILogger<ContainerDynamicsService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext  = hubContext;
        _logger  = logger;
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
            var simulator= scope.ServiceProvider.GetRequiredService<FillageSimulator>();

            var ambientTemp = await ResolveAmbientAsync(weather);

            var containers = await db.TrashContainers
                .Include(c => c.Area)
                .ToListAsync(token);

            var notifications = new List<object>();

            foreach (var c in containers)
                ApplyUpdates(c, simulator, ambientTemp, notifications);

            await SaveBatchedAsync(db, containers, token);
            await BroadcastAsync(containers, token);

            if (notifications.Count > 0)
                await _hubContext.Clients.All.SendAsync("AdminNotification", notifications, token);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Container dynamics cycle failed.");
        }
    }

    private static async Task<double> ResolveAmbientAsync(IExternalWeatherService weather)
    {
        try { 
            return await weather.GetAmbientTemperatureAsync(SofiaLat, SofiaLng) ?? FallbackAmbient; }
        catch 
        { 
            return FallbackAmbient; }
    }

    private void ApplyUpdates(
        TrashContainer container,
        FillageSimulator simulator,
        double ambientTemp,
        List<object> notifications)
    {
        var zoneMultiplier = container.Area?.FillMultiplier ?? 1.0;

        container.FillPercentage = Math.Clamp(
            container.FillPercentage + simulator.CalculateFillIncrement(container, zoneMultiplier),
            0, 100);

        if (container.HasSensor && container.Status != TrashContainerStatus.SensorBroken)
        {
            container.Temperature = container.Temperature == null
                ? ambientTemp
                : simulator.SimulateTemperature(container, ambientTemp);

            if (container.BatteryPercentage == null || container.BatteryPercentage == 0)
            {
                container.BatteryPercentage = 100;
            }
            else
            {
                container.BatteryPercentage = Math.Max(
                    0,
                    container.BatteryPercentage.Value - FillageSimulator.CalculateBatteryDrain(container));

                if (container.BatteryPercentage <= 0)
                {
                    container.HasSensor = false;
                    container.Temperature = null;
                    container.BatteryPercentage = null;
                    if (container.Status == TrashContainerStatus.SensorBroken)
                        container.Status = TrashContainerStatus.Active;

                    _lowBatteryNotified.Remove(container.Id);

                    notifications.Add(new
                    {
                        Type= "battery_dead",
                        ContainerId= container.Id,
                        AreaId = container.AreaId,
                        Message= $"Сензорът на контейнер #{container.Id} ({container.AreaId}) е изтощен и е деактивиран."
                    });
                }
                else if (container.BatteryPercentage < LowBatteryThreshold
                         && !_lowBatteryNotified.Contains(container.Id))
                {
                    _lowBatteryNotified.Add(container.Id);

                    notifications.Add(new
                    {
                        Type = "battery_low",
                        ContainerId = container.Id,
                        AreaId= container.AreaId,
                        Battery  = Math.Round(container.BatteryPercentage.Value, 1),
                        Message= $"Ниска батерия: контейнер #{container.Id} ({container.AreaId}) — {container.BatteryPercentage.Value:F0}%"
                    });
                }
                else if (container.BatteryPercentage >= LowBatteryThreshold)
                {
                    _lowBatteryNotified.Remove(container.Id);
                }
            }
        }
        else
        {
            container.Temperature = null;
        }

        if (container.Status != TrashContainerStatus.Active)
            return;

        container.Status = FillageSimulator.DetermineStatus(container);
    }

    private static async Task SaveBatchedAsync(
        BinMapsDbContext db,
        List<TrashContainer> containers,
        CancellationToken token)
    {
        for (int i = 0; i < containers.Count; i += BatchSize)
        {
            foreach (var c in containers.Skip(i).Take(BatchSize))
            {
                var entry = db.Entry(c);
                entry.Property(x => x.FillPercentage).IsModified   = true;
                entry.Property(x => x.Temperature).IsModified       = true;
                entry.Property(x => x.BatteryPercentage).IsModified = true;
                entry.Property(x => x.HasSensor).IsModified         = true;
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
            c.HasSensor,
            Status = (int?)c.Status
        });
        await _hubContext.Clients.All.SendAsync("ContainersUpdated", payload, token);
    }
}
