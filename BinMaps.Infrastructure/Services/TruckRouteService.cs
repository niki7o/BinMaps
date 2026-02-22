using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.EntityFrameworkCore;


namespace BinMaps.Infrastructure.Services;

public sealed class TruckRouteService : ITruckRouteService
{
    private readonly IRepository<TrashContainer, int> _containerRepo;
    private readonly IRepository<Truck, int> _truckRepo;

    private const double EarthRadiusKm = 6_371.0;
    private const double AvgSpeedKmh = 30.0;
    private const int TimePerStopMinutes = 5;
    private const double MinFillThreshold = 40.0;

    public TruckRouteService(
        IRepository<TrashContainer, int> containerRepo,
        IRepository<Truck, int> truckRepo)
    {
        _containerRepo = containerRepo;
        _truckRepo = truckRepo;
    }

    public async Task<RouteResultDto> GenerateRouteAsync(string areaId, TrashType trashType)
    {
        var truck = await GetActiveTruckAsync(areaId);
        if (truck is null)
            return EmptyRoute(areaId, trashType, "Няма активен камион в тази зона.");

        var candidates = await GetEligibleContainersAsync(areaId, trashType);
        if (candidates.Count == 0)
            return EmptyRoute(areaId, trashType, "Няма контейнери за събиране.");

        var prioritized = Prioritize(candidates);
        var selected = SelectByCapacity(prioritized, truck.Capacity);
        if (selected.Count == 0)
            return EmptyRoute(areaId, trashType, "Камионът няма достатъчен капацитет.");

        var graph = BuildGraph(truck, selected);
        var route = SolveTSP(graph, selected);

        return BuildResult(truck, route, areaId, trashType);
    }

    #region Private - Data

    private async Task<Truck?> GetActiveTruckAsync(string areaId)
        => await _truckRepo.GetAllAttached()
            .FirstOrDefaultAsync(t => t.AreaId == areaId && t.IsActive);

    private async Task<List<TrashContainer>> GetEligibleContainersAsync(string areaId, TrashType trashType)
        => await _containerRepo.GetAllAttached()
            .Where(c =>
                c.AreaId == areaId &&
                c.TrashType == trashType &&
                c.Status != TrashContainerStatus.Fire &&
                c.Status != TrashContainerStatus.Offline &&
                c.FillPercentage >= MinFillThreshold)
            .ToListAsync();

    private static List<TrashContainer> Prioritize(List<TrashContainer> containers)
        => containers
            .OrderByDescending(c =>
                c.FillPercentage >= 90 ? 3 :
                c.FillPercentage >= 70 ? 2 :
                c.FillPercentage >= 50 ? 1 : 0)
            .ThenByDescending(c => c.FillPercentage)
            .ToList();

    private static List<TrashContainer> SelectByCapacity(List<TrashContainer> ordered, double truckCapacity)
    {
        var selected = new List<TrashContainer>();
        var totalLoad = 0.0;

        foreach (var c in ordered)
        {
            var load = c.FillPercentage / 100.0 * c.Capacity;
            if (totalLoad + load > truckCapacity) continue;
            selected.Add(c);
            totalLoad += load;
        }

        return selected;
    }

    #endregion

    #region Private - Graph

    private static RouteGraph BuildGraph(Truck truck, List<TrashContainer> containers)
    {
        var graph = new RouteGraph();
        graph.AddNode(new RouteNode { Id = -1, LocationX = truck.LocationX, LocationY = truck.LocationY });

        foreach (var c in containers)
            graph.AddNode(new RouteNode { Id = c.Id, LocationX = c.LocationX, LocationY = c.LocationY, Container = c });

        var nodes = graph.Nodes;
        foreach (var a in nodes)
            foreach (var b in nodes)
                if (a.Id != b.Id)
                    graph.AddEdge(a.Id, b.Id, HaversineKm(a.LocationX, a.LocationY, b.LocationX, b.LocationY));

        return graph;
    }

    private static List<TrashContainer> SolveTSP(RouteGraph graph, List<TrashContainer> containers)
    {
        var result = new List<TrashContainer>();
        var unvisited = new HashSet<int>(containers.Select(c => c.Id));
        var currentId = -1;

        while (unvisited.Count > 0)
        {
            var nearest = FindNearestViaDijkstra(graph, currentId, unvisited);
            if (nearest is null) break;

            result.Add(containers.First(c => c.Id == nearest.TargetId));
            unvisited.Remove(nearest.TargetId);
            currentId = nearest.TargetId;
        }

        return result;
    }

    private static DijkstraResult? FindNearestViaDijkstra(RouteGraph graph, int startId, HashSet<int> targets)
    {
        var dist = graph.Nodes.ToDictionary(n => n.Id, _ => double.MaxValue);
        dist[startId] = 0;
        var visited = new HashSet<int>();
        var queue = new SortedSet<(double Distance, int Id)>(
            Comparer<(double Distance, int Id)>.Create((a, b) => a.Distance != b.Distance
                ? a.Distance.CompareTo(b.Distance)
                : a.Id.CompareTo(b.Id)));
        queue.Add((Distance: 0, Id: startId));

        while (queue.Count > 0)
        {
            var (currentDist, nodeId) = queue.Min;
            queue.Remove(queue.Min);

            if (!visited.Add(nodeId)) continue;

            var node = graph.GetNode(nodeId);
            if (node is null) continue;

            foreach (var edge in node.Edges)
            {
                if (visited.Contains(edge.TargetId)) continue;
                var newDist = currentDist + edge.Weight;
                if (newDist < dist[edge.TargetId])
                {
                    queue.Remove((Distance: dist[edge.TargetId], Id: edge.TargetId));
                    dist[edge.TargetId] = newDist;
                    queue.Add((Distance: newDist, Id: edge.TargetId));
                }
            }
        }

        return targets
            .Where(t => dist.TryGetValue(t, out var d) && d < double.MaxValue)
            .Select(t => new DijkstraResult { TargetId = t, Distance = dist[t] })
            .MinBy(r => r.Distance);
    }

    #endregion

    #region Private - Result

    private static RouteResultDto BuildResult(Truck truck, List<TrashContainer> route, string areaId, TrashType trashType)
    {
        var stops = new List<TrashContainerRouteDto>();
        var totalDistance = 0.0;
        var totalLoad = 0.0;
        var prevX = truck.LocationX;
        var prevY = truck.LocationY;

        for (var i = 0; i < route.Count; i++)
        {
            var c = route[i];
            var dist = HaversineKm(prevX, prevY, c.LocationX, c.LocationY);
            var load = c.FillPercentage / 100.0 * c.Capacity;

            totalDistance += dist;
            totalLoad += load;

            stops.Add(new TrashContainerRouteDto
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
                Status = c.Status,
                StopNumber = i + 1,
                DistanceFromPrevious = Math.Round(dist, 2),
                EstimatedLoad = Math.Round(load, 2)
            });

            prevX = c.LocationX;
            prevY = c.LocationY;
        }

        var estimatedTime = (int)Math.Ceiling(totalDistance / AvgSpeedKmh * 60 + stops.Count * TimePerStopMinutes);

        return new RouteResultDto
        {
            TruckId = truck.Id,
            AreaId = areaId,
            TrashType = trashType,
            Route = stops,
            TotalDistance = Math.Round(totalDistance, 2),
            TotalLoad = Math.Round(totalLoad, 2),
            TruckCapacity = truck.Capacity,
            CapacityUtilization = Math.Round(totalLoad / truck.Capacity * 100, 2),
            ContainersCount = stops.Count,
            EstimatedTimeMinutes = estimatedTime,
            Message = $"Dijkstra TSP: {stops.Count} контейнера, {Math.Round(totalDistance, 1)} км"
        };
    }

    private static RouteResultDto EmptyRoute(string areaId, TrashType trashType, string message) =>
        new() { AreaId = areaId, TrashType = trashType, Message = message };

    private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
              * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return EarthRadiusKm * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private static double ToRad(double deg) => deg * Math.PI / 180.0;

    #endregion
}

internal sealed class RouteGraph
{
    public List<RouteNode> Nodes { get; } = new();

    public void AddNode(RouteNode node) => Nodes.Add(node);

    public void AddEdge(int fromId, int toId, double weight)
        => GetNode(fromId)?.Edges.Add(new RouteEdge { TargetId = toId, Weight = weight });

    public RouteNode? GetNode(int id) => Nodes.FirstOrDefault(n => n.Id == id);
}

internal sealed class RouteNode
{
    public int Id { get; set; }
    public double LocationX { get; set; }
    public double LocationY { get; set; }
    public TrashContainer? Container { get; set; }
    public List<RouteEdge> Edges { get; } = new();
}

internal sealed class RouteEdge
{
    public int TargetId { get; set; }
    public double Weight { get; set; }
}

internal sealed class DijkstraResult
{
    public int TargetId { get; set; }
    public double Distance { get; set; }
}