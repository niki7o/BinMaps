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

            var truck = await FindTruckForAreaAsync(areaId);
            if (truck == null)
            {
                return CreateEmptyRoute(areaId, trashType, "Няма наличен камион в тази зона");
            }


            var containers = await GetContainersForCollectionAsync(areaId, trashType);
            if (!containers.Any())
            {
                return CreateEmptyRoute(areaId, trashType, "Няма контейнери за събиране");
            }


            var prioritizedContainers = PrioritizeContainers(containers);


            var selectedContainers = SelectByCapacity(prioritizedContainers, truck.Capacity);
            if (!selectedContainers.Any())
            {
                return CreateEmptyRoute(areaId, trashType, "Камионът няма достатъчен капацитет");
            }


            var graph = BuildGraph(truck, selectedContainers);


            var route = FindOptimalPath(graph, truck, selectedContainers);


            return BuildRouteResult(truck, route, areaId, trashType);
        }

        #endregion

        #region Container Selection

        private async Task<Truck?> FindTruckForAreaAsync(string areaId)
        {
            var trucks = await _truckRepo.GetAllAsync();

          
            return trucks.FirstOrDefault(t => t.AreaId == areaId);
        }

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

        private List<TrashContainer> PrioritizeContainers(List<TrashContainer> containers)
        {
            return containers
                .OrderByDescending(c => c.Status == TrashContainerStatus.Fire ? 3 : 0)
                .ThenByDescending(c => c.FillPercentage >= 90 ? 2 : 0)
                .ThenByDescending(c => c.FillPercentage >= 70 ? 1 : 0)
                .ThenByDescending(c => c.FillPercentage)
                .ToList();
        }

        private List<TrashContainer> SelectByCapacity(List<TrashContainer> containers, double truckCapacity)
        {
            var selected = new List<TrashContainer>();
            double totalLoad = 0;

            foreach (var container in containers)
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

        #region Graph Construction


        private Graph BuildGraph(Truck truck, List<TrashContainer> containers)
        {
            var graph = new Graph();


            var truckNode = new GraphNode
            {
                Id = -1,
                LocationX = truck.LocationX,
                LocationY = truck.LocationY,
                IsTruck = true
            };
            graph.AddNode(truckNode);

            foreach (var container in containers)
            {
                var node = new GraphNode
                {
                    Id = container.Id,
                    LocationX = container.LocationX,
                    LocationY = container.LocationY,
                    Container = container
                };
                graph.AddNode(node);
            }


            foreach (var nodeA in graph.Nodes)
            {
                foreach (var nodeB in graph.Nodes)
                {
                    if (nodeA.Id != nodeB.Id)
                    {
                        double distance = CalculateGPSDistance(
                            nodeA.LocationX, nodeA.LocationY,
                            nodeB.LocationX, nodeB.LocationY);

                        graph.AddEdge(nodeA.Id, nodeB.Id, distance);
                    }
                }
            }

            return graph;
        }

        #endregion

        #region Dijkstra Algorithm


        private List<TrashContainer> FindOptimalPath(Graph graph, Truck truck, List<TrashContainer> containers)
        {
            var route = new List<TrashContainer>();
            var visited = new HashSet<int>();
            int currentNodeId = -1;

            visited.Add(currentNodeId);

            while (visited.Count <= containers.Count)
            {
                var nearestNode = FindNearestUnvisitedNode(graph, currentNodeId, visited);

                if (nearestNode == null) break;

                if (!nearestNode.IsTruck)
                {
                    route.Add(nearestNode.Container!);
                }

                visited.Add(nearestNode.Id);
                currentNodeId = nearestNode.Id;
            }

            return route;
        }

        private GraphNode? FindNearestUnvisitedNode(Graph graph, int currentNodeId, HashSet<int> visited)
        {
            var currentNode = graph.GetNode(currentNodeId);
            if (currentNode == null) return null;

            GraphNode? nearest = null;
            double minDistance = double.MaxValue;

            foreach (var edge in currentNode.Edges)
            {
                if (!visited.Contains(edge.TargetNodeId))
                {
                    if (edge.Weight < minDistance)
                    {
                        minDistance = edge.Weight;
                        nearest = graph.GetNode(edge.TargetNodeId);
                    }
                }
            }

            return nearest;
        }

        #endregion

        #region GPS Distance

        private double CalculateGPSDistance(double lat1, double lon1, double lat2, double lon2)
        {
            var dLat = ToRadians(lat2 - lat1);
            var dLon = ToRadians(lon2 - lon1);

            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

            return EARTH_RADIUS_KM * c;
        }

        private double ToRadians(double degrees) => degrees * (Math.PI / 180.0);

        #endregion

        #region Result Building

        private RouteResultDto BuildRouteResult(
            Truck truck,
            List<TrashContainer> route,
            string areaId,
            TrashType trashType)
        {
            double totalDistance = 0;
            double totalLoad = 0;
            double prevLat = truck.LocationX;
            double prevLon = truck.LocationY;

            var routeDtos = new List<TrashContainerRouteDto>();

            for (int i = 0; i < route.Count; i++)
            {
                var container = route[i];
                double distance = CalculateGPSDistance(prevLat, prevLon, container.LocationX, container.LocationY);
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
                Message = $"Граф маршрут (Dijkstra): {routeDtos.Count} контейнера, {Math.Round(totalDistance, 1)} км"
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

    #region Graph Data Structures


    public class Graph
    {
        public List<GraphNode> Nodes { get; set; } = new();

        public void AddNode(GraphNode node) => Nodes.Add(node);

        public void AddEdge(int fromId, int toId, double weight)
        {
            var from = GetNode(fromId);
            from?.Edges.Add(new GraphEdge
            {
                SourceNodeId = fromId,
                TargetNodeId = toId,
                Weight = weight
            });
        }

        public GraphNode? GetNode(int id) => Nodes.FirstOrDefault(n => n.Id == id);
    }


    public class GraphNode
    {
        public int Id { get; set; }
        public double LocationX { get; set; }
        public double LocationY { get; set; }
        public bool IsTruck { get; set; }
        public TrashContainer? Container { get; set; }
        public List<GraphEdge> Edges { get; set; } = new();
    }


    public class GraphEdge
    {
        public int SourceNodeId { get; set; }
        public int TargetNodeId { get; set; }
        public double Weight { get; set; }
    }

    #endregion
}