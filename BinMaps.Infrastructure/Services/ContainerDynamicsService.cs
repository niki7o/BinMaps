using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;



namespace BinMaps.Infrastructure.Services
{
   
    public class ContainerDynamicsService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<ContainerDynamicsService> _logger;
        private readonly TimeSpan _updateInterval = TimeSpan.FromSeconds(3); 

      

        private readonly Dictionary<string, TrafficPattern> _trafficPatterns = new()
        {
            { "Зона 1 - Надежда север", new TrafficPattern
                { BaseRate = 0.9, PeakMultiplier = 1.8, PeakHours = new[] { 8, 18, 20 } }
            },
            { "Зона 2 - Център", new TrafficPattern
                { BaseRate = 1.5, PeakMultiplier = 2.2, PeakHours = new[] { 9, 12, 14, 19 } }
            },
            { "Зона 3 - Люлин", new TrafficPattern
                { BaseRate = 1.1, PeakMultiplier = 2.0, PeakHours = new[] { 8, 18, 20 } }
            },
            { "Зона 4 - Овча Купел", new TrafficPattern
                { BaseRate = 0.85, PeakMultiplier = 1.7, PeakHours = new[] { 8, 18, 20 } }
            },
            { "Зона 5 - Юг и Витоша", new TrafficPattern
                { BaseRate = 0.7, PeakMultiplier = 1.5, PeakHours = new[] { 9, 19 } }
            },
            { "Зона 6 - Изток", new TrafficPattern
                { BaseRate = 0.95, PeakMultiplier = 1.9, PeakHours = new[] { 8, 18, 20 } }
            }
        };

        private readonly Dictionary<TrashType, double> _trashTypeMultipliers = new()
        {
            { TrashType.Mixed,   1.0 },
            { TrashType.Plastic, 0.65 },
            { TrashType.Paper,   0.45 },
            { TrashType.Glass,   0.25 }
        };

        public ContainerDynamicsService(
            IServiceProvider serviceProvider,
            ILogger<ContainerDynamicsService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

      

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation(" LIVE Container Dynamics started (3 sec updates + SignalR)");

            await Task.Delay(2000, stoppingToken); 

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await UpdateAndBroadcast();
                    await Task.Delay(_updateInterval, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Container Dynamics");
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
        }


        private async Task UpdateAndBroadcast()
        {
            using var scope = _serviceProvider.CreateScope();

            var containerRepo = scope.ServiceProvider
                .GetRequiredService<IRepository<TrashContainer, int>>();

           
            var hubContext = scope.ServiceProvider
                .GetService<IHubContext<ContainerHub>>();

            var containers = await containerRepo.GetAllAsync();
            var currentHour = DateTime.Now.Hour;
            var dayOfWeek = DateTime.Now.DayOfWeek;

            var changedContainers = new List<object>();

            foreach (var container in containers)
            {
                if (container.Status == TrashContainerStatus.Fire ||
                    container.Status == TrashContainerStatus.Offline)
                    continue;

                var oldFill = container.FillPercentage;

                var fillRate = CalculateFillRate(
                    container.AreaId,
                    container.TrashType,
                    currentHour,
                    dayOfWeek,
                    container.HasSensor
                );

               
                var newFill = Math.Min(100, container.FillPercentage + (fillRate / 60.0));
                container.FillPercentage = Math.Round(newFill, 2);

                if (container.HasSensor)
                {
                    container.Temperature = CalculateTemperature(container.FillPercentage, currentHour);
                }

              
                if (container.HasSensor &&
                    container.Temperature > 50 &&
                    container.FillPercentage > 80)
                {
                    container.Status = TrashContainerStatus.Fire;
                    _logger.LogWarning($"FIRE: Container #{container.Id} at {container.AreaId}");
                }

                await containerRepo.UpdateAsync(container);

               
                if (Math.Abs(newFill - oldFill) > 0.01)
                {
                    changedContainers.Add(new
                    {
                        container.Id,
                        container.AreaId,
                        container.FillPercentage,
                        container.Temperature,
                        container.Status
                    });
                }
            }

           
            if (hubContext != null && changedContainers.Any())
            {
                await hubContext.Clients.All.SendAsync("ContainersUpdated", changedContainers);
            }

            _logger.LogDebug($" Updated {containers.Count()} containers, broadcasted {changedContainers.Count} changes");
        }


        private double CalculateFillRate(
            string areaId,
            TrashType trashType,
            int hour,
            DayOfWeek dayOfWeek,
            bool hasSensor)
        {
            var pattern = _trafficPatterns.GetValueOrDefault(areaId,
                new TrafficPattern { BaseRate = 1.0, PeakMultiplier = 1.8, PeakHours = new[] { 8, 18 } }
            );

            double rate = pattern.BaseRate;

            if (pattern.PeakHours.Contains(hour))
                rate *= pattern.PeakMultiplier;

            rate *= _trashTypeMultipliers.GetValueOrDefault(trashType, 1.0);

            if (dayOfWeek == DayOfWeek.Saturday || dayOfWeek == DayOfWeek.Sunday)
                rate *= 0.75;

            if (hour >= 2 && hour <= 6)
                rate *= 0.15;

            if (hasSensor)
                rate *= (0.95 + new Random().NextDouble() * 0.10);

            
            return rate * 0.18;
        }

        private double CalculateTemperature(double fillPercentage, int hour)
        {
            var ambient = 15 + (hour >= 11 && hour <= 17 ? 8 : 0);
            var decompositionHeat = fillPercentage > 50 ? (fillPercentage - 50) * 0.28 : 0;
            return Math.Round(ambient + decompositionHeat + (new Random().NextDouble() * 5 - 2.5), 1);
        }
    }

    public class TrafficPattern
    {
        public double BaseRate { get; set; }
        public double PeakMultiplier { get; set; }
        public int[] PeakHours { get; set; } = Array.Empty<int>();
    }
}