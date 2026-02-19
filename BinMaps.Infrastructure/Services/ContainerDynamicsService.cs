using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;



namespace BinMaps.Infrastructure.Services
{

    public class ContainerDynamicsService : BackgroundService
    {
       
            private readonly IServiceProvider _serviceProvider;
            private readonly IHubContext<ContainerHub> _hubContext;
            private readonly FillageSimulator _fillSimulator;

            public ContainerDynamicsService(
                IServiceProvider serviceProvider,
                IHubContext<ContainerHub> hubContext)
            {
                _serviceProvider = serviceProvider;
                _hubContext = hubContext;
                _fillSimulator = new FillageSimulator();
            }

            protected override async Task ExecuteAsync(CancellationToken stoppingToken)
            {
      

                await Task.Delay(2000, stoppingToken);

                while (!stoppingToken.IsCancellationRequested)
                {
                    try
                    {
                        using var scope = _serviceProvider.CreateScope();
                        var context = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();

                        var containers = await context.TrashContainers.ToListAsync(stoppingToken);

                        if (!containers.Any())
                        {
                            await Task.Delay(5000, stoppingToken);
                            continue;
                        }

                        var updates = new List<ContainerUpdateDto>();

                        foreach (var container in containers)
                        {
                            if (container.FillPercentage < 100)
                            {
                                double increment = _fillSimulator.CalculateFillIncrement(container);
                                container.FillPercentage = Math.Min(100.0, container.FillPercentage + increment);
                            }

                            if (container.HasSensor)
                            {
                                container.Temperature = _fillSimulator.SimulateTemperature(container);

                               
                                if (container.BatteryPercentage.HasValue)
                                {
                                    double batteryDrain = _fillSimulator.CalculateBatteryDrain(container);
                                    container.BatteryPercentage = Math.Max(0.0, container.BatteryPercentage.Value - batteryDrain);
                                }
                            }

                            UpdateContainerStatus(container);

                            updates.Add(new ContainerUpdateDto
                            {
                                Id = container.Id,
                                AreaId = container.AreaId,
                                FillPercentage = container.FillPercentage,
                                Temperature = container.Temperature,
                                BatteryPercentage = container.BatteryPercentage,
                                Status = container.Status?.ToString()
                            });
                        }

                        await context.SaveChangesAsync(stoppingToken);

                        await _hubContext.Clients.All.SendAsync(
                            "ContainersUpdated",
                            updates,
                            stoppingToken
                        );

                        if (DateTime.Now.Second % 30 == 0)
                        {
                            var avgFill = containers.Average(c => c.FillPercentage);
                            var criticalCount = containers.Count(c => c.FillPercentage > 80);
                            Console.WriteLine($"📊 Containers: {containers.Count} | Avg Fill: {avgFill:F1}% | Critical: {criticalCount}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ ContainerDynamicsService error: {ex.Message}");
                    }

                    await Task.Delay(3000, stoppingToken);
                }
            }

            private void UpdateContainerStatus(TrashContainer container)
            {
                if (container.Temperature > 55 && container.FillPercentage > 70)
                {
                    container.Status = TrashContainerStatus.Fire;
                }
                else if (container.HasSensor && container.BatteryPercentage.HasValue && container.BatteryPercentage.Value < 10)
                {
                    container.Status = TrashContainerStatus.SensorBroken;
                }
                else if (container.Status != TrashContainerStatus.Active)
                {
                    container.Status = TrashContainerStatus.Active;
                }
            }

            private class ContainerUpdateDto
            {
                public int Id { get; set; }
                public string AreaId { get; set; } = string.Empty;
                public double FillPercentage { get; set; }
                public double? Temperature { get; set; }
                public double? BatteryPercentage { get; set; }  
                public string? Status { get; set; }
            }
        }
    }
    