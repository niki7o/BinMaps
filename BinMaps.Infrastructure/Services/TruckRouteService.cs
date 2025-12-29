using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services
{
    public class TruckRouteService : ITruckRouteService
    {
        private readonly IRepository<Truck, int> _truckRepo;
        private readonly IRepository<TrashContainer, int> _containerRepo;

        private readonly double weightFill = 0.5;
        private readonly double weightDistance = 0.3;
        private readonly double weightStatus = 0.2;

        public TruckRouteService(
            IRepository<Truck, int> truckRepo,
            IRepository<TrashContainer, int> containerRepo)
        {
            _truckRepo = truckRepo;
            _containerRepo = containerRepo;
        }

        public async Task<IEnumerable<TrashContainerRouteDto>> GenerateRouteAsync(int truckId)
        {
            var truck = await _truckRepo.GetByIdAsync(truckId);
            if (truck == null)
                return Enumerable.Empty<TrashContainerRouteDto>();

             var allContainers = (await _containerRepo.GetAllAsync())
                  .Where(c => c.AreaId.Equals(truck.AreaId))
                  .Where(c => c.Status != TrashContainerStatus.Offline)
                 .ToList();

            var smartContainers = allContainers
                .Where(c => c.HasSensor)
                .Where(c => c.TrashType == truck.TrashType)
                .ToList();

            var mixedContainers = allContainers
                .Where(c => !c.HasSensor && c.TrashType == TrashType.Mixed)
                .ToList();
            double depotX = 0;
            double depotY = 0;
            double currentX = depotX;
            double currentY = depotY;
            double truckCapacity = truck.Capacity;
            double currentLoad = 0;

            var route = new List<TrashContainerRouteDto>();
            var remaining = new List<TrashContainer>(smartContainers);

            while (remaining.Any())
            {
                var scored = remaining.Select(c => new
                {
                    Container = c,
                    Score = CalculateScore(c, currentX, currentY)
                })
                .OrderByDescending(x => x.Score)
                .ToList();

                var next = scored.First().Container;

                double projectedLoad = currentLoad + next.FillPercentage / 100 * next.Capacity;
                if (projectedLoad > truckCapacity)
                {
                    currentX = depotX;
                    currentY = depotY;
                    currentLoad = 0;
                    continue;
                }

                var nearbyMixed = mixedContainers
                   .Where(m =>
                    Distance(next.LocationX, next.LocationY, m.LocationX, m.LocationY) < 0.2 )
                   .ToList();

                foreach (var mixed in nearbyMixed)
                {
                    route.Add(new TrashContainerRouteDto
                    {
                        Id = mixed.Id,
                        Capacity = mixed.Capacity,
                        FillPercentage = 0, 
                        LocationX = mixed.LocationX,
                        LocationY = mixed.LocationY,
                        Score = 0 
                    });

                    mixedContainers.Remove(mixed);
                }
            }

            return route;
        }

        private double CalculateScore(TrashContainer c, double currentX, double currentY)
        {
            if (!c.HasSensor)
            {
                return 0;
            }
            double distance = Distance(currentX, currentY, c.LocationX, c.LocationY);
            double statusScore = c.Status switch
            {
                TrashContainerStatus.Fire => 100,
                TrashContainerStatus.Active => 50,
                TrashContainerStatus.Offline => 0,
                _ => 0
            };

            return weightFill * c.FillPercentage
                 + weightDistance * (1 / (1 + distance))
                 + weightStatus * statusScore;
        }

       

        private double Distance(double x1, double y1, double x2, double y2)
            => Math.Sqrt(Math.Pow(x2 - x1, 2) + Math.Pow(y2 - y1, 2));
    }
}
