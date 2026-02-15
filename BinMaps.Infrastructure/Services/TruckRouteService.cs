using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services
{
  
    public class TruckRouteService : ITruckRouteService
    {
        #region Private Fields & Constants

        private readonly IRepository<TrashContainer, int> _containerRepo;
        private readonly IRepository<Truck, int> _truckRepo;

        private const double EARTH_RADIUS_KM = 6371.0;
        private const double AVG_SPEED_KMH = 30.0;        
        private const int TIME_PER_STOP_MINUTES = 5;      
        private const double MIN_FILL_THRESHOLD = 40.0;   
        private const double PRIORITY_FILL_THRESHOLD = 70.0; 

        #endregion

        #region Constructor

        public TruckRouteService(
            IRepository<TrashContainer, int> containerRepo,
            IRepository<Truck, int> truckRepo)
        {
            _containerRepo = containerRepo;
            _truckRepo = truckRepo;
        }

        #endregion

        #region Public API

        
        public async Task<RouteResultDto> GenerateRouteAsync(string areaId, TrashType trashType)
        {
            // 1. Намери камион в зоната
            var truck = await FindTruckForAreaAsync(areaId, trashType);
            if (truck == null)
            {
                return CreateEmptyRoute(areaId, trashType, "Няма наличен камион в тази зона");
            }

            // 2. Намери подходящи контейнери
            var containers = await GetContainersForCollectionAsync(areaId, trashType);
            if (!containers.Any())
            {
                return CreateEmptyRoute(areaId, trashType, "Няма контейнери за събиране");
            }

            // 3. Приоритизирай и филтрирай по капацитет
            var selectedContainers = SelectContainersByCapacity(containers, truck.Capacity);
            if (!selectedContainers.Any())
            {
                return CreateEmptyRoute(areaId, trashType, "Камионът няма достатъчен капацитет");
            }

            // 4. Оптимизирай маршрут с TSP
            var optimizedRoute = OptimizeRoute(truck, selectedContainers);

            // 5. Изчисли статистики
            return BuildRouteResult(truck, optimizedRoute, areaId, trashType);
        }

        #endregion

        #region Container Selection & Filtering

       
        private async Task<Truck?> FindTruckForAreaAsync(string areaId, TrashType trashType)
        {
            var trucks = await _truckRepo.GetAllAsync();
            return trucks.FirstOrDefault(t =>
                t.AreaId == areaId &&
                t.TrashType == trashType);
        }

        /// <summary>
        /// Намира всички подходящи контейнери за събиране
        /// </summary>
        private async Task<List<TrashContainer>> GetContainersForCollectionAsync(string areaId, TrashType trashType)
        {
            var allContainers = await _containerRepo.GetAllAsync();

            return allContainers
                .Where(c => c.AreaId == areaId)
                .Where(c => c.TrashType == trashType)
                .Where(c => c.Status != TrashContainerStatus.Fire)
                .Where(c => c.Status != TrashContainerStatus.Offline)
                .Where(c => c.FillPercentage >= MIN_FILL_THRESHOLD)
                .ToList();
        }

        /// <summary>
        /// Избира контейнери според капацитета на камиона
        /// Приоритизира: 1) Пожари 2) Пълни (>90%) 3) Високо ниво (>70%)
        /// </summary>
        private List<TrashContainer> SelectContainersByCapacity(
            List<TrashContainer> containers,
            double truckCapacity)
        {
            // Приоритизация
            var prioritized = containers
                .OrderByDescending(c => c.Status == TrashContainerStatus.Fire ? 3 : 0)
                .ThenByDescending(c => c.FillPercentage >= 90 ? 2 : 0)
                .ThenByDescending(c => c.FillPercentage >= PRIORITY_FILL_THRESHOLD ? 1 : 0)
                .ThenByDescending(c => c.FillPercentage)
                .ToList();

            // Капацитетен филтър
            var selected = new List<TrashContainer>();
            double totalLoad = 0;

            foreach (var container in prioritized)
            {
                double containerLoad = (container.FillPercentage / 100.0) * container.Capacity;

                if (totalLoad + containerLoad <= truckCapacity)
                {
                    selected.Add(container);
                    totalLoad += containerLoad;
                }
            }

            return selected;
        }

        #endregion

        #region TSP Optimization

       
        private List<TrashContainer> OptimizeRoute(Truck truck, List<TrashContainer> containers)
        {
            if (containers.Count <= 1) return containers;

          
            var route = SolveTSPNearestNeighbor(truck.LocationX, truck.LocationY, containers);

         
            if (route.Count >= 4)
            {
                route = Improve2Opt(route);
            }

            return route;
        }

      
        private List<TrashContainer> SolveTSPNearestNeighbor(
            double startLat,
            double startLon,
            List<TrashContainer> containers)
        {
            var unvisited = new List<TrashContainer>(containers);
            var route = new List<TrashContainer>();

            double currentLat = startLat;
            double currentLon = startLon;

            while (unvisited.Any())
            {
                // Намери най-близката
                var nearest = unvisited
                    .OrderBy(c => HaversineDistance(currentLat, currentLon, c.LocationX, c.LocationY))
                    .First();

                route.Add(nearest);
                currentLat = nearest.LocationX;
                currentLon = nearest.LocationY;
                unvisited.Remove(nearest);
            }

            return route;
        }

       
     
        private List<TrashContainer> Improve2Opt(List<TrashContainer> route)
        {
            bool improved = true;
            var bestRoute = new List<TrashContainer>(route);

            while (improved)
            {
                improved = false;
                double bestDistance = CalculateRouteDistance(bestRoute);

                for (int i = 1; i < bestRoute.Count - 1; i++)
                {
                    for (int k = i + 1; k < bestRoute.Count; k++)
                    {
                        var newRoute = Reverse2OptSegment(bestRoute, i, k);
                        double newDistance = CalculateRouteDistance(newRoute);

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

      
        private List<TrashContainer> Reverse2OptSegment(List<TrashContainer> route, int i, int k)
        {
            var newRoute = new List<TrashContainer>(route);
            newRoute.Reverse(i, k - i + 1);
            return newRoute;
        }

       
        private double CalculateRouteDistance(List<TrashContainer> route)
        {
            double total = 0;
            for (int i = 0; i < route.Count - 1; i++)
            {
                total += HaversineDistance(
                    route[i].LocationX, route[i].LocationY,
                    route[i + 1].LocationX, route[i + 1].LocationY);
            }
            return total;
        }

        #endregion

        #region Distance Calculation

       
        private double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
        {
            double dLat = ToRadians(lat2 - lat1);
            double dLon = ToRadians(lon2 - lon1);

            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                       Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                       Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

            return EARTH_RADIUS_KM * c;
        }

        private double ToRadians(double degrees) => degrees * (Math.PI / 180.0);

        #endregion

        #region Result Building

      
        private RouteResultDto BuildRouteResult(
            Truck truck,
            List<TrashContainer> optimizedRoute,
            string areaId,
            TrashType trashType)
        {
            double totalDistance = 0;
            double totalLoad = 0;
            double prevLat = truck.LocationX;
            double prevLon = truck.LocationY;

            var routeDtos = new List<TrashContainerRouteDto>();

            for (int i = 0; i < optimizedRoute.Count; i++)
            {
                var container = optimizedRoute[i];
                double distance = HaversineDistance(prevLat, prevLon, container.LocationX, container.LocationY);
                double load = (container.FillPercentage / 100.0) * container.Capacity;

                totalDistance += distance;
                totalLoad += load;

                routeDtos.Add(new TrashContainerRouteDto
                {
                    Id = container.Id,
                    AreaId = container.AreaId,
                    Capacity = container.Capacity,
                    FillPercentage = container.FillPercentage,
                    HasSensor = container.HasSensor,
                    LocationX = container.LocationX,
                    LocationY = container.LocationY,
                    Temperature = container.Temperature,
                    TrashType = container.TrashType,
                    Status = container.Status,
                    StopNumber = i + 1,
                    DistanceFromPrevious = Math.Round(distance, 2),
                    EstimatedLoad = Math.Round(load, 2)
                });

                prevLat = container.LocationX;
                prevLon = container.LocationY;
            }

            int estimatedTime = (int)Math.Ceiling(
                (totalDistance / AVG_SPEED_KMH * 60) +
                (routeDtos.Count * TIME_PER_STOP_MINUTES));

            return new RouteResultDto
            {
                TruckId = truck.Id,
                AreaId = areaId,
                TrashType = trashType,
                Route = routeDtos,
                TotalDistance = Math.Round(totalDistance, 2),
                TotalLoad = Math.Round(totalLoad, 2),
                TruckCapacity = truck.Capacity,
                CapacityUtilization = Math.Round((totalLoad / truck.Capacity) * 100, 2),
                ContainersCount = routeDtos.Count,
                EstimatedTimeMinutes = estimatedTime,

                Message = $"Оптимален маршрут: {routeDtos.Count} контейнера, {Math.Round(totalDistance, 1)} км"
            };
        }

      
        private RouteResultDto CreateEmptyRoute(string areaId, TrashType trashType, string message)
        {
            return new RouteResultDto
            {
                TruckId = 0,
                AreaId = areaId,
                TrashType = trashType,
                Route = new List<TrashContainerRouteDto>(),
                Message = message
            };
        }

        #endregion
    }
}