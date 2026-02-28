using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Models;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Infrastructure.Services;

public sealed class TruckRouteService : ITruckRouteService
{
    private const double MinFillPercentForCollection = 40.0;
    private const double AverageSpeedKmh = 30.0;
    private const double MinutesPerStop = 5.0;

    private readonly IRepository<Truck, int> _truckRepo;
    private readonly IRepository<TrashContainer, int> _containerRepo;

    public TruckRouteService(
        IRepository<Truck, int> truckRepo,
        IRepository<TrashContainer, int> containerRepo)
    {
        _truckRepo = truckRepo;
        _containerRepo = containerRepo;
    }

    #region Public

    public async Task<RouteResultDto> GenerateRouteAsync(string areaId, TrashType trashType)
    {
        var truck = await FindTruckAsync(areaId, trashType);

        var candidates = await GetCandidateContainersAsync(areaId, trashType);

        var selected = SelectByCapacity(candidates, truck.Capacity);

        if (selected.Count == 0)
            return EmptyRoute(truck, areaId, trashType);

        var orderedRoute = SolveTSPWithDijkstra(truck, selected);

        return BuildResult(truck, areaId, trashType, orderedRoute);
    }

    #endregion

    #region Private

    private async Task<Truck> FindTruckAsync(string areaId, TrashType trashType)
    {
        var truck = await _truckRepo
            .GetAllAttached()
            .FirstOrDefaultAsync(t => t.AreaId == areaId);

        return truck ?? throw new InvalidOperationException(
            $"No truck found for area '{areaId}'.");
    }

    private async Task<List<TrashContainer>> GetCandidateContainersAsync(string areaId, TrashType trashType)
    {
        return await _containerRepo
            .GetAllAttached()
            .Where(c =>
                c.AreaId == areaId &&
                c.TrashType == trashType &&
                c.FillPercentage >= MinFillPercentForCollection &&
                c.Status != TrashContainerStatus.Fire &&
                c.Status != TrashContainerStatus.Offline &&
                c.Status != TrashContainerStatus.SensorBroken)
            .OrderByDescending(c => c.FillPercentage)
            .ToListAsync();
    }

    private static List<TrashContainer> SelectByCapacity(List<TrashContainer> containers, double truckCapacityKg)
    {
        var selected = new List<TrashContainer>();
        double totalKg = 0;

        foreach (var c in containers)
        {
            var estimatedKg = (c.FillPercentage / 100.0) * c.Capacity;
            if (totalKg + estimatedKg <= truckCapacityKg)
            {
                selected.Add(c);
                totalKg += estimatedKg;
            }
        }

        return selected;
    }

    private static List<TrashContainer> SolveTSPWithDijkstra(Truck truck, List<TrashContainer> containers)
    {
        var graph = BuildGraph(truck, containers);

        var visited = new HashSet<int>();
        var ordered = new List<TrashContainer>();
        var current = -1;

        while (visited.Count < containers.Count)
        {
            var distances = graph.Dijkstra(current);

            TrashContainer? nearest = null;
            double nearestDist = double.MaxValue;

            foreach (var container in containers)
            {
                if (visited.Contains(container.Id))
                    continue;

                if (distances.TryGetValue(container.Id, out var d) && d < nearestDist)
                {
                    nearestDist = d;
                    nearest = container;
                }
            }

            if (nearest is null)
                break;

            ordered.Add(nearest);
            visited.Add(nearest.Id);
            current = nearest.Id;
        }

        return ordered;
    }

    private static Graph BuildGraph(Truck truck, List<TrashContainer> containers)
    {
        var graph = new Graph();

        graph.AddNode(new GraphNode { Id = -1, LocationX = truck.LocationX, LocationY = truck.LocationY, IsTruck = true });

        foreach (var c in containers)
            graph.AddNode(new GraphNode { Id = c.Id, LocationX = c.LocationX, LocationY = c.LocationY });

        var allNodes = new List<(int Id, double X, double Y)>
        {
            (-1, truck.LocationX, truck.LocationY)
        };
        allNodes.AddRange(containers.Select(c => (c.Id, c.LocationX, c.LocationY)));

        for (int i = 0; i < allNodes.Count; i++)
        {
            for (int j = 0; j < allNodes.Count; j++)
            {
                if (i == j) continue;
                var dist = Haversine(allNodes[i].X, allNodes[i].Y, allNodes[j].X, allNodes[j].Y);
                graph.AddEdge(allNodes[i].Id, allNodes[j].Id, dist);
            }
        }

        return graph;
    }

    private static double Haversine(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371.0;
        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                 + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
                 * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private static double ToRad(double deg) => deg * Math.PI / 180.0;

    private static RouteResultDto BuildResult(Truck truck, string areaId, TrashType trashType, List<TrashContainer> ordered)
    {
        var stops = new List<ContainerStopDTO>();
        double prevX = truck.LocationX;
        double prevY = truck.LocationY;
        double total = 0;
        double load = 0;
        int stopNum = 1;

        foreach (var c in ordered)
        {
            var dist = Haversine(prevX, prevY, c.LocationX, c.LocationY);
            var estLoad = (c.FillPercentage / 100.0) * c.Capacity;

            stops.Add(new ContainerStopDTO
            {
                Id = c.Id,
                StopNumber = stopNum++,
                FillPercentage = c.FillPercentage,
                LocationX = c.LocationX,
                LocationY = c.LocationY,
                DistanceFromPrevious = Math.Round(dist, 3),
                EstimatedLoad = Math.Round(estLoad, 1),
                TrashType = c.TrashType,
                Status = c.Status
            });

            total += dist;
            load += estLoad;
            prevX = c.LocationX;
            prevY = c.LocationY;
        }

        var timeMinutes = (total / AverageSpeedKmh * 60) + (ordered.Count * MinutesPerStop);

        return new RouteResultDto
        {
            TruckId = truck.Id,
            AreaId = areaId,
            TrashType = trashType,
            Route = stops,
            TotalDistance = Math.Round(total, 2),
            TotalLoad = Math.Round(load, 1),
            TruckCapacity = truck.Capacity,
            CapacityUtilization = Math.Round(load / truck.Capacity * 100, 1),
            ContainersCount = ordered.Count,
            EstimatedTimeMinutes = Math.Round(timeMinutes, 1),
            Message = $"Dijkstra TSP: {ordered.Count} контейнера, {Math.Round(total, 1)} км"
        };
    }

    private static RouteResultDto EmptyRoute(Truck truck, string areaId, TrashType trashType)
        => new()
        {
            TruckId = truck.Id,
            AreaId = areaId,
            TrashType = trashType,
            Message = "Няма контейнери за събиране в тази зона."
        };





    #endregion


    internal sealed class GraphEdge
    {
        public int TargetId { get; init; }
        public double Weight { get; init; }
    }

    internal sealed class GraphNode
    {
        public int Id { get; init; }
        public double LocationX { get; init; }
        public double LocationY { get; init; }
        public bool IsTruck { get; init; }

        public List<GraphEdge> Edges { get; } = new();
    }

    internal sealed class Graph
    {
        private readonly Dictionary<int, GraphNode> _nodes = new();

        #region Building

        public void AddNode(GraphNode node)
            => _nodes[node.Id] = node;

        public void AddEdge(int fromId, int toId, double weight)
        {
            if (fromId == toId)
                return;

            if (_nodes.TryGetValue(fromId, out var from))
                from.Edges.Add(new GraphEdge { TargetId = toId, Weight = weight });
        }

        public GraphNode? GetNode(int id)
            => _nodes.GetValueOrDefault(id);

        public IReadOnlyCollection<GraphNode> GetNodes()
            => _nodes.Values;

        #endregion

        #region Dijkstra

        public Dictionary<int, double> Dijkstra(int startId)
        {
            var distances = _nodes.Keys.ToDictionary(k => k, _ => double.MaxValue);
            distances[startId] = 0;

            var queue = new SortedSet<(double Distance, int Id)>(
                Comparer<(double, int)>.Create((a, b)
                    => a.Item1 != b.Item1 ? a.Item1.CompareTo(b.Item1) : a.Item2.CompareTo(b.Item2)));

            queue.Add((0, startId));

            while (queue.Count > 0)
            {
                var (currentDist, nodeId) = queue.Min;
                queue.Remove(queue.Min);

                if (currentDist > distances[nodeId])
                    continue;

                var node = _nodes[nodeId];

                foreach (var edge in node.Edges)
                {
                    var newDist = currentDist + edge.Weight;
                    if (newDist < distances[edge.TargetId])
                    {
                        distances[edge.TargetId] = newDist;
                        queue.Add((newDist, edge.TargetId));
                    }
                }
            }

            return distances;
        }

        #endregion
    }
}