using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Services
{
    public class TruckRouteService : ITruckRouteService
    {
        private readonly IRepository<Truck, int> _truckRepo;
        private readonly IRepository<TrashContainer, int> _containerRepo;

        public TruckRouteService(
            IRepository<Truck, int> truckRepo,
            IRepository<TrashContainer, int> containerRepo)
        {
            _truckRepo = truckRepo;
            _containerRepo = containerRepo;
        }

        public async Task<IEnumerable<TrashContainerRouteDto>> GenerateRouteAsync(int truckId, TrashType? overrideType = null)
        {
            var truck = await _truckRepo.GetByIdAsync(truckId);
            if (truck == null) return Enumerable.Empty<TrashContainerRouteDto>();

            var selectedType = overrideType ?? truck.TrashType;

            var allContainers = (await _containerRepo.GetAllAsync())
                .Where(c => c.AreaId == truck.AreaId)
                .Where(c => c.Status != TrashContainerStatus.Fire)
                .Where(c => c.TrashType == selectedType)
                .ToList();

            var containersToCollect = allContainers
                .Where(c => c.FillPercentage >= 40)
                .ToList();

            var route = new List<TrashContainerRouteDto>();
            double currentX = truck.LocationX;
            double currentY = truck.LocationY;
            double currentLoad = 0;
            double truckCapacity = truck.Capacity;

            while (containersToCollect.Any())
            {
                var next = containersToCollect
                    .OrderBy(c => Distance(currentX, currentY, c.LocationX, c.LocationY))
                    .First();

                double load = (next.FillPercentage / 100.0) * next.Capacity;

                if (currentLoad + load > truckCapacity)
                    break;

                route.Add(Map(next, currentX, currentY));

                currentLoad += load;
                currentX = next.LocationX;
                currentY = next.LocationY;

                containersToCollect.Remove(next);
            }

            return route;
        }

        private double CalculateScore(TrashContainer c, double currentX, double currentY)
        {
            double distance = Distance(currentX, currentY, c.LocationX, c.LocationY);
            double distanceFactor = 1 / (1 + distance);
            return (0.7 * distanceFactor) + (0.3 * (c.FillPercentage / 100.0));
        }

        private TrashContainerRouteDto Map(TrashContainer c, double x, double y)
        {
            return new TrashContainerRouteDto
            {
                Id = c.Id,
                AreaId = c.AreaId,
                Capacity = c.Capacity,
                FillPercentage = c.FillPercentage,
                HasSensor = c.HasSensor,
                LocationX = c.LocationX,
                LocationY = c.LocationY,
                TrashType = c.TrashType,
                Status = c.Status ?? TrashContainerStatus.Active,
                Score = CalculateScore(c, x, y)
            };
        }

        private double Distance(double x1, double y1, double x2, double y2)
            => Math.Sqrt(Math.Pow(x2 - x1, 2) + Math.Pow(y2 - y1, 2));
    }
}