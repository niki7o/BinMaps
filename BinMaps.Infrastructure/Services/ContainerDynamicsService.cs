using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace BinMaps.Infrastructure.Services;

public sealed class ContainerDynamicsService : BackgroundService
{
    private const int UpdateIntervalSeconds = 10;
    private const int BatchSize = 50;
    private const double BaseFillIncrement = 0.8;

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
            await RunUpdateCycleAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(UpdateIntervalSeconds), stoppingToken);
        }
    }

    private async Task RunUpdateCycleAsync(CancellationToken token)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();

            var containers = await context.TrashContainers
                .Include(c => c.Area)
                .ToListAsync(token);

            foreach (var container in containers)
            {
                UpdateFill(container);
                UpdateTemperature(container);
                UpdateBattery(container);
                UpdateStatus(container);
            }

            await context.SaveChangesAsync(token);

            var payload = containers.Select(c => new
            {
                c.Id,
                c.FillPercentage,
                c.Temperature,
                c.BatteryPercentage,
                c.Status   // integer — matches frontend numeric check (status === 1 for Fire)
            });

            await _hubContext.Clients.All.SendAsync(
                "ContainersUpdated",
                payload,
                token);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Container dynamics update failed");
        }
    }

    private static void UpdateFill(TrashContainer container)
    {
        var zoneMultiplier = container.Area?.FillMultiplier ?? 1.0;

        var slowdown = container.FillPercentage switch
        {
            > 85 => 0.4,
            > 65 => 0.7,
            _ => 1.0
        };

        var random = 0.8 + Random.Shared.NextDouble() * 0.4;

        var increment = BaseFillIncrement *
                        zoneMultiplier *
                        slowdown *
                        random;

        container.FillPercentage =
            Math.Clamp(container.FillPercentage + increment, 0, 100);
    }

    private static void UpdateTemperature(TrashContainer container)
    {
        var ambient = 15 + Random.Shared.NextDouble() * 10;
        var organic = container.TrashType == TrashType.Mixed
            ? container.FillPercentage * 0.15
            : 0;

        var variance = (Random.Shared.NextDouble() * 4) - 2;

        container.Temperature =
            Math.Clamp(ambient + organic + variance, 10, 60);
    }

    private static void UpdateBattery(TrashContainer container)
    {
        if (!container.HasSensor || container.BatteryPercentage is null)
            return;

        container.BatteryPercentage =
            Math.Max(0, container.BatteryPercentage.Value - 0.002);
    }

    private static void UpdateStatus(TrashContainer container)
    {
        if (container.Temperature > 55 && container.FillPercentage > 70)
        {
            container.Status = TrashContainerStatus.Fire;
            return;
        }

        if (container.HasSensor && container.BatteryPercentage < 10)
        {
            container.Status = TrashContainerStatus.SensorBroken;
            return;
        }

        if (container.Status is TrashContainerStatus.Fire
            or TrashContainerStatus.SensorBroken)
        {
            container.Status = TrashContainerStatus.Active;
        }
    }
}