﻿using BinMaps.Data;
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
    #region Constants

    private static readonly TimeSpan UpdateInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan WeatherCacheDuration = TimeSpan.FromMinutes(30);
    private const int BatchSize = 50;
    private const double SofiaLat = 42.6977;
    private const double SofiaLng  = 23.3219;
    private const double FallbackAmbient = 20.0;
    private const double LowBatteryThreshold = 20.0;

    #endregion

    #region Fields

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<ContainerHub> _hubContext;
    private readonly ILogger<ContainerDynamicsService> _logger;

    private readonly HashSet<int> _lowBatteryNotified = new();

    
    private double _cachedTemp = FallbackAmbient;
    private DateTime _tempCachedAt = DateTime.MinValue;

    #endregion

    #region Constructor

    public ContainerDynamicsService(
        IServiceScopeFactory scopeFactory,
        IHubContext<ContainerHub> hubContext,
        ILogger<ContainerDynamicsService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext  = hubContext;
        _logger  = logger;
    }

    #endregion

    #region Background Service

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await RunCycleAsync(stoppingToken);
            await Task.Delay(UpdateInterval, stoppingToken);
        }
    }

    #endregion

    #region Cycle

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
            var changedIds = new HashSet<int>();

            foreach (var c in containers)
            {
                var changed = ApplyUpdates(c, simulator, ambientTemp, notifications);
                if (changed) changedIds.Add(c.Id);
            }

            await SaveBatchedAsync(db, containers, token);
            await BroadcastAsync(containers, changedIds, token);

            if (notifications.Count > 0)
                await _hubContext.Clients.All.SendAsync("AdminNotification", notifications, token);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Container dynamics cycle failed.");
        }
    }

    #endregion

    #region Weather

    
    private async Task<double> ResolveAmbientAsync(IExternalWeatherService weather)
    {
        if (DateTime.UtcNow - _tempCachedAt < WeatherCacheDuration)
            return _cachedTemp;

        try
        {
            _cachedTemp = await weather.GetAmbientTemperatureAsync(SofiaLat, SofiaLng) ?? FallbackAmbient;
            _tempCachedAt = DateTime.UtcNow;
            return _cachedTemp;
        }
        catch
        {
            return FallbackAmbient;
        }
    }

    #endregion

    #region Updates

    
    private bool ApplyUpdates(
        TrashContainer container,
        FillageSimulator simulator,
        double ambientTemp,
        List<object> notifications)
    {
        var changed = false;
        var zoneMultiplier = container.Area?.FillMultiplier ?? 1.0;

        var newFill = Math.Clamp(
            container.FillPercentage + simulator.CalculateFillIncrement(container, zoneMultiplier),
            0, 100);

        if (newFill != container.FillPercentage)
        {
            container.FillPercentage = newFill;
            changed = true;
        }

        if (container.HasSensor && container.Status != TrashContainerStatus.SensorBroken)
        {
            var newTemp = container.Temperature == null
                ? ambientTemp
                : simulator.SimulateTemperature(container, ambientTemp);

            if (newTemp != container.Temperature)
            {
                container.Temperature = newTemp;
                changed = true;
            }

            if (container.BatteryPercentage == null || container.BatteryPercentage == 0)
            {
                container.BatteryPercentage = 100;
                changed = true;
            }
            else
            {
                var newBattery = Math.Max(
                    0,
                    container.BatteryPercentage.Value - FillageSimulator.CalculateBatteryDrain(container));

                if (newBattery != container.BatteryPercentage)
                {
                    container.BatteryPercentage = newBattery;
                    changed = true;
                }
                if (container.BatteryPercentage <= 0)
                {
                   

                    container.BatteryPercentage = 100;
                    container.Status = TrashContainerStatus.Active;
                    _lowBatteryNotified.Remove(container.Id);
                    changed = true;

                    notifications.Add(new
                    {
                        Type = "battery_recharged",
                        ContainerId = container.Id,
                        AreaId = container.AreaId,
                        Message = $"Батерията на сензор #{container.Id} ({container.AreaId}) е подменена — рестартиран на 100%."
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
            if (container.Temperature != null)
            {
                container.Temperature = null;
                changed = true;
            }
        }

        if (container.Status != TrashContainerStatus.Active)
            return changed;

        var newStatus = FillageSimulator.DetermineStatus(container);
        if (newStatus != container.Status)
        {
            container.Status = newStatus;
            changed = true;
        }

        return changed;
    }

    #endregion

    #region Persistence

    private static async Task SaveBatchedAsync(
        BinMapsDbContext db,
        List<TrashContainer> containers,
        CancellationToken token)
    {
        foreach (var c in containers)
        {
            var entry = db.Entry(c);
            entry.Property(x => x.FillPercentage).IsModified = true;
            entry.Property(x => x.Temperature).IsModified   = true;
            entry.Property(x => x.BatteryPercentage).IsModified = true;
            entry.Property(x => x.HasSensor).IsModified = true;
            if (c.Status != TrashContainerStatus.Offline)
                entry.Property(x => x.Status).IsModified = true;
        }

        await db.SaveChangesAsync(token);
    }

    #endregion

    #region Broadcast

    
    private async Task BroadcastAsync(
        List<TrashContainer> containers,
        HashSet<int> changedIds,
        CancellationToken token)
    {
        if (changedIds.Count == 0) return;

        var payload = containers
            .Where(c => changedIds.Contains(c.Id))
            .Select(c => new
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

    #endregion
}