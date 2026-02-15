using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Services
{
   
    public class ContainerDynamicsService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<ContainerDynamicsService> _logger;
        private readonly TimeSpan _updateInterval = TimeSpan.FromMinutes(3); 

      
        private readonly Dictionary<string, TrafficPattern> _trafficPatterns = new()
        {
            { "A", new TrafficPattern { BaseRate = 0.8, PeakMultiplier = 2.0, PeakHours = new[] { 8, 12, 18 } } },
            { "B", new TrafficPattern { BaseRate = 1.2, PeakMultiplier = 1.8, PeakHours = new[] { 9, 13, 19 } } },
            { "C", new TrafficPattern { BaseRate = 0.6, PeakMultiplier = 1.5, PeakHours = new[] { 7, 14, 20 } } },
            { "D", new TrafficPattern { BaseRate = 1.0, PeakMultiplier = 2.2, PeakHours = new[] { 8, 12, 19 } } },
        };

        
        private readonly Dictionary<TrashType, double> _trashTypeMultipliers = new()
        {
            { TrashType.Mixed, 1.0 },      
            { TrashType.Plastic, 0.7 },    
            { TrashType.Paper, 0.5 },      
            { TrashType.Glass, 0.3 }       
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
            _logger.LogInformation("Container Dynamics Service started");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await UpdateContainerFillLevels();
                    await Task.Delay(_updateInterval, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Container Dynamics Service");
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                }
            }
        }

        private async Task UpdateContainerFillLevels()
        {
            using var scope = _serviceProvider.CreateScope();
            var containerRepo = scope.ServiceProvider
                .GetRequiredService<IRepository<TrashContainer, int>>();

            var containers = await containerRepo.GetAllAsync();
            var currentHour = DateTime.Now.Hour;
            var dayOfWeek = DateTime.Now.DayOfWeek;

            foreach (var container in containers)
            {
              
                if (container.Status == TrashContainerStatus.Fire)
                    continue;

                var fillRate = CalculateFillRate(
                    container.AreaId,
                    container.TrashType,
                    currentHour,
                    dayOfWeek,
                    container.HasSensor);

               
                var newFill = Math.Min(100, container.FillPercentage + fillRate);
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
                    _logger.LogWarning($"FIRE DETECTED in container {container.Id} at {container.AreaId}");
                }

                await containerRepo.UpdateAsync(container);
            }

            _logger.LogInformation($"Updated {containers.Count()} containers at {DateTime.Now:HH:mm}");
        }

        private double CalculateFillRate(
            string areaId,
            TrashType trashType,
            int hour,
            DayOfWeek dayOfWeek,
            bool hasSensor)
        {
            
            var pattern = _trafficPatterns.GetValueOrDefault(areaId, new TrafficPattern { BaseRate = 1.0 });
            var baseRate = pattern.BaseRate;

           
            if (pattern.PeakHours.Contains(hour))
            {
                baseRate *= pattern.PeakMultiplier;
            }

            baseRate *= _trashTypeMultipliers.GetValueOrDefault(trashType, 1.0);

           
            if (dayOfWeek == DayOfWeek.Saturday || dayOfWeek == DayOfWeek.Sunday)
            {
                baseRate *= 0.6;
            }

          
            if (hour >= 2 && hour <= 6)
            {
                baseRate *= 0.2;
            }

           
            if (hasSensor)
            {
                baseRate *= (0.95 + new Random().NextDouble() * 0.1); 
            }

           
            return baseRate * 0.15;
        }

        private double CalculateTemperature(double fillPercentage, int hour)
        {
            
            var ambient = 15 + (hour >= 12 && hour <= 18 ? 10 : 0); 

           
            var decompositionHeat = fillPercentage > 50
                ? (fillPercentage - 50) * 0.3
                : 0;

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