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
        private const double EARTH_RADIUS_KM = 6371.0;

        public TruckRouteService(
            IRepository<Truck, int> truckRepo,
            IRepository<TrashContainer, int> containerRepo)
        {
            _truckRepo = truckRepo;
            _containerRepo = containerRepo;
        }

        public async Task<RouteResultDto> GenerateRouteAsync(int truckId, TrashType? overrideType = null)
        {
            var truck = await _truckRepo.GetByIdAsync(truckId);
            if (truck == null)
                return new RouteResultDto { Route = new List<TrashContainerRouteDto>() };

            var selectedType = overrideType ?? truck.TrashType;


            var allContainers = (await _containerRepo.GetAllAsync())
                .Where(c => c.AreaId == truck.AreaId)
                .Where(c => c.Status != TrashContainerStatus.Fire)
                .Where(c => c.TrashType == selectedType)
                .ToList();

            var priorityContainers = allContainers
                .Where(c => c.FillPercentage >= 70)
                .ToList();


            var secondaryContainers = allContainers
                .Where(c => c.FillPercentage >= 40 && c.FillPercentage < 70)
                .ToList();


            var containersToCollect = new List<TrashContainer>(priorityContainers);


            var estimatedPriorityLoad = priorityContainers.Sum(c => (c.FillPercentage / 100.0) * c.Capacity);
            var remainingCapacity = truck.Capacity - estimatedPriorityLoad;

            foreach (var container in secondaryContainers.OrderByDescending(c => c.FillPercentage))
            {
                var containerLoad = (container.FillPercentage / 100.0) * container.Capacity;
                if (containerLoad <= remainingCapacity)
                {
                    containersToCollect.Add(container);
                    remainingCapacity -= containerLoad;
                }
            }

            if (!containersToCollect.Any())
            {
                return new RouteResultDto
                {
                    Route = new List<TrashContainerRouteDto>(),
                    Message = "Няма контейнери за събиране в момента"
                };
            }


            var route = SolveTSP(truck, containersToCollect);


            var totalDistance = CalculateTotalDistance(truck.LocationX, truck.LocationY, route);
            var totalLoad = route.Sum(r => (r.FillPercentage / 100.0) * r.Capacity);
            var estimatedTime = CalculateEstimatedTime(totalDistance, route.Count);

            return new RouteResultDto
            {
                Route = route,
                TotalDistance = totalDistance,
                TotalLoad = totalLoad,
                TruckCapacity = truck.Capacity,
                CapacityUtilization = (totalLoad / truck.Capacity) * 100,
                EstimatedTimeMinutes = estimatedTime,
                ContainersCount = route.Count,
                Message = $"Оптимален маршрут с {route.Count} контейнера"
            };
        }


        private List<TrashContainerRouteDto> SolveTSP(Truck truck, List<TrashContainer> containers)
        {
            if (!containers.Any()) return new List<TrashContainerRouteDto>();
            if (containers.Count == 1)
                return new List<TrashContainerRouteDto> { MapToRouteDto(containers[0], truck.LocationX, truck.LocationY, 0) };

            // Phase 1: Nearest Neighbor algorithm
            var route = new List<TrashContainer>();
            var remaining = new List<TrashContainer>(containers);
            double currentX = truck.LocationX;
            double currentY = truck.LocationY;
            int stopNumber = 0;

            while (remaining.Any())
            {

                var next = remaining
                    .Select(c => new
                    {
                        Container = c,
                        Distance = HaversineDistance(currentX, currentY, c.LocationX, c.LocationY),
                        Priority = c.FillPercentage >= 70 ? 2.0 : 1.0
                    })
                    .OrderBy(x => x.Distance / x.Priority)
                    .First()
                    .Container;

                route.Add(next);
                remaining.Remove(next);
                currentX = next.LocationX;
                currentY = next.LocationY;
            }


            route = TwoOptImprovement(route, truck);


            return route.Select((c, index) => MapToRouteDto(c,
                index == 0 ? truck.LocationX : route[index - 1].LocationX,
                index == 0 ? truck.LocationY : route[index - 1].LocationY,
                index + 1))
                .ToList();
        }


        private List<TrashContainer> TwoOptImprovement(List<TrashContainer> route, Truck truck)
        {
            if (route.Count < 4) return route;

            bool improved = true;
            var bestRoute = new List<TrashContainer>(route);

            while (improved)
            {
                improved = false;
                double bestDistance = CalculateTotalDistance(truck.LocationX, truck.LocationY,
                    bestRoute.Select((c, i) => MapToRouteDto(c,
                        i == 0 ? truck.LocationX : bestRoute[i - 1].LocationX,
                        i == 0 ? truck.LocationY : bestRoute[i - 1].LocationY, i)).ToList());

                for (int i = 0; i < bestRoute.Count - 2; i++)
                {
                    for (int j = i + 2; j < bestRoute.Count; j++)
                    {
                        var newRoute = new List<TrashContainer>(bestRoute);


                        newRoute.Reverse(i + 1, j - i);

                        double newDistance = CalculateTotalDistance(truck.LocationX, truck.LocationY,
                            newRoute.Select((c, idx) => MapToRouteDto(c,
                                idx == 0 ? truck.LocationX : newRoute[idx - 1].LocationX,
                                idx == 0 ? truck.LocationY : newRoute[idx - 1].LocationY, idx)).ToList());

                        if (newDistance < bestDistance)
                        {
                            bestRoute = newRoute;
                            bestDistance = newDistance;
                            improved = true;
                        }
                    }
                }
            }

            return bestRoute;
        }


        private double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
        {
            var dLat = ToRadians(lat2 - lat1);
            var dLon = ToRadians(lon2 - lon1);

            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return EARTH_RADIUS_KM * c;
        }

        private double ToRadians(double degrees) => degrees * Math.PI / 180.0;

        private double CalculateTotalDistance(double startX, double startY, List<TrashContainerRouteDto> route)
        {
            if (!route.Any()) return 0;

            double total = HaversineDistance(startY, startX, route[0].LocationY, route[0].LocationX);

            for (int i = 0; i < route.Count - 1; i++)
            {
                total += HaversineDistance(
                    route[i].LocationY, route[i].LocationX,
                    route[i + 1].LocationY, route[i + 1].LocationX);
            }

            return total;
        }

        private int CalculateEstimatedTime(double distanceKm, int stops)
        {
            const double AVG_SPEED_KMH = 30.0;
            const int TIME_PER_STOP_MIN = 5;

            double drivingTime = (distanceKm / AVG_SPEED_KMH) * 60;
            double stopTime = stops * TIME_PER_STOP_MIN;

            return (int)Math.Ceiling(drivingTime + stopTime);
        }

        private TrashContainerRouteDto MapToRouteDto(TrashContainer c, double prevX, double prevY, int stopNumber)
        {
            var distance = HaversineDistance(prevY, prevX, c.LocationY, c.LocationX);

            return new TrashContainerRouteDto
            {
                Id = c.Id,
                AreaId = c.AreaId,
                Capacity = c.Capacity,
                FillPercentage = c.FillPercentage,
                HasSensor = c.HasSensor,
                LocationX = c.LocationX,
                LocationY = c.LocationY,
                Temperature = c.Temperature,
                TrashType = c.TrashType,
                Status = c.Status ?? TrashContainerStatus.Active,
                StopNumber = stopNumber,
                DistanceFromPrevious = distance,
                EstimatedLoad = (c.FillPercentage / 100.0) * c.Capacity
            };
        }
    }


    public class RouteResultDto
    {
        public List<TrashContainerRouteDto> Route { get; set; } = new();
        public double TotalDistance { get; set; }
        public double TotalLoad { get; set; }
        public double TruckCapacity { get; set; }
        public double CapacityUtilization { get; set; }
        public int EstimatedTimeMinutes { get; set; }
        public int ContainersCount { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}