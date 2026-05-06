using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Infrastructure.Services;

public sealed class TruckRouteService : ITruckRouteService
{
    private const double MinFillPercentForCollection = 40.0;
    private const double MinutesPerStop = 5.0;

    private readonly IRepository<Truck, int> _truckRepo;
    private readonly IRepository<TrashContainer, int> _containerRepo;
    private readonly IExternalRoutingService _routing;

    public TruckRouteService(
        IRepository<Truck, int> truckRepo,
        IRepository<TrashContainer, int> containerRepo,
        IExternalRoutingService routing)
    {
        _truckRepo = truckRepo;
        _containerRepo = containerRepo;
        _routing = routing;
    }

    #region Public

    public async Task<RouteResultDto> GenerateRouteAsync(string areaId, TrashType trashType)
    {
        var truck = await FindTruckAsync(areaId, trashType);
        var candidates = await GetCandidatesAsync(areaId, trashType);
        var selected = SelectByCapacity(candidates, truck.Capacity);

        if (selected.Count == 0)
            return EmptyRoute(truck, areaId, trashType);

        var coords = BuildCoordinateList(truck, selected);
        var matrix = await _routing.GetMatrixAsync(coords, coords);
        var graph = BuildGraph(truck, selected, matrix);
        var ordered = SolveTSPWithDijkstra(graph, selected);

        return BuildResult(truck, areaId, trashType, ordered, graph);
    }

    #endregion

    #region Pipeline

    private async Task<Truck> FindTruckAsync(string areaId, TrashType trashType)
    {
        var query = _truckRepo.GetAllAttached().Where(t => t.AreaId == areaId);

        var truck = await query.FirstOrDefaultAsync(t => t.TrashType == trashType)
                 ?? await query.FirstOrDefaultAsync();

        return truck ?? throw new InvalidOperationException(
            $"Няма камион за зона '{areaId}'. Проверете конфигурацията на камионите.");
    }

    private async Task<List<TrashContainer>> GetCandidatesAsync(string areaId, TrashType trashType)
        => await _containerRepo
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

    private static List<TrashContainer> SelectByCapacity(List<TrashContainer> containers, double capacityKg)
    {
        var selected = new List<TrashContainer>();
        double loadKg = 0;

        foreach (var c in containers)
        {
            var estKg = (c.FillPercentage / 100.0) * c.Capacity;
            if (loadKg + estKg > capacityKg) continue;
            selected.Add(c);
            loadKg += estKg;
        }

        return selected;
    }

    private static IReadOnlyList<GeoCoordinate> BuildCoordinateList(Truck truck, List<TrashContainer> containers)
    {
        var coords = new List<GeoCoordinate>(containers.Count + 1)
        {
            new(truck.LocationX, truck.LocationY)
        };
        coords.AddRange(containers.Select(c => new GeoCoordinate(c.LocationX, c.LocationY)));
        return coords;
    }

    #endregion

    #region Graph Building

    private static Graph BuildGraph(Truck truck, List<TrashContainer> containers, RouteMatrix? matrix)
    {
        var graph = new Graph();

        graph.AddNode(new GraphNode
        {
            Id = -1,
            LocationX = truck.LocationX,
            LocationY = truck.LocationY,
            IsTruck = true
        });

        foreach (var c in containers)
            graph.AddNode(new GraphNode
            {
                Id = c.Id,
                LocationX = c.LocationX,
                LocationY = c.LocationY
            });

        var allNodes = new List<(int Id, double Lat, double Lng, int MatrixIndex)>
        {
            (-1, truck.LocationX, truck.LocationY, 0)
        };

        for (int i = 0; i < containers.Count; i++)
            allNodes.Add((containers[i].Id, containers[i].LocationX, containers[i].LocationY, i + 1));

        for (int i = 0; i < allNodes.Count; i++)
        {
            for (int j = 0; j < allNodes.Count; j++)
            {
                if (i == j) continue;

                var weight = ResolveEdgeWeight(
                    allNodes[i].MatrixIndex, allNodes[j].MatrixIndex,
                    allNodes[i].Lat, allNodes[i].Lng,
                    allNodes[j].Lat, allNodes[j].Lng,
                    matrix);

                graph.AddEdge(allNodes[i].Id, allNodes[j].Id, weight);
            }
        }

        return graph;
    }

    private static double ResolveEdgeWeight(
        int fromMatrixIdx, int toMatrixIdx,
        double fromLat, double fromLng,
        double toLat, double toLng,
        RouteMatrix? matrix)
    {
        if (matrix?.Legs.TryGetValue((fromMatrixIdx, toMatrixIdx), out var leg) == true)
            return leg.TravelTimeSeconds;

        return Haversine(fromLat, fromLng, toLat, toLng);
    }

    #endregion

    #region TSP + Dijkstra

    private static List<TrashContainer> SolveTSPWithDijkstra(Graph graph, List<TrashContainer> containers)
    {
        var visited = new HashSet<int>();
        var ordered = new List<TrashContainer>(containers.Count);
        var current = -1;

        while (visited.Count < containers.Count)
        {
            var distances = graph.Dijkstra(current);
            var nearest = (Container: (TrashContainer?)null, Distance: double.MaxValue);

            foreach (var container in containers)
            {
                if (visited.Contains(container.Id)) continue;
                if (distances.TryGetValue(container.Id, out var d) && d < nearest.Distance)
                    nearest = (container, d);
            }

            if (nearest.Container is null) break;

            visited.Add(nearest.Container.Id);
            ordered.Add(nearest.Container);
            current = nearest.Container.Id;
        }

        return ordered;
    }

    #endregion

    #region Result Building

    private static RouteResultDto BuildResult(
        Truck truck, string areaId, TrashType trashType,
        List<TrashContainer> ordered, Graph graph)
    {
        var stops = new List<ContainerStopDto>(ordered.Count);
        double totalDistKm = 0;
        double totalLoadKg = 0;
        double totalSec = 0;
        int stopNum = 1;
        var current = -1;

        foreach (var container in ordered)
        {
            var edge = graph.GetShortestEdge(current, container.Id);
            var distKm = edge?.DistanceKm ?? 0;
            var travelSec = edge?.TravelSeconds ?? 0;
            var estLoadKg = (container.FillPercentage / 100.0) * container.Capacity;

            stops.Add(new ContainerStopDto
            {
                Id  = container.Id,
                StopNumber  = stopNum++,
                FillPercentage    = container.FillPercentage,
                LocationX   = container.LocationX,
                LocationY    = container.LocationY,
                DistanceFromPrevious = Math.Round(distKm, 3),
                EstimatedLoad  = Math.Round(estLoadKg, 1),
                Capacity = container.Capacity,
                HasSensor  = container.HasSensor,
                AreaId  = container.AreaId,
                TrashType   = container.TrashType,
                Status = container.Status
            });

            totalDistKm += distKm;
            totalLoadKg += estLoadKg;
            totalSec += travelSec;
            current = container.Id;
        }

        var totalMinutes = totalSec / 60.0 + ordered.Count * MinutesPerStop;

        return new RouteResultDto
        {
            TruckId = truck.Id,
            DepotX = truck.LocationX,   
            DepotY = truck.LocationY,   
            AreaId = areaId,
            TrashType = trashType,
            Route = stops,
            TotalDistance = Math.Round(totalDistKm, 2),
            TotalLoad = Math.Round(totalLoadKg, 1),
            TruckCapacity = truck.Capacity,
            CapacityUtilization = Math.Round(totalLoadKg / truck.Capacity * 100, 1),
            ContainersCount = ordered.Count,
            EstimatedTimeMinutes = Math.Round(totalMinutes, 1),
            Message = $"Dijkstra TSP: {ordered.Count} контейнера, {Math.Round(totalDistKm, 1)} км"
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

    #region Math

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

    #endregion

    #region Graph

    internal sealed class GraphEdge
    {
        public int TargetId { get; init; }
        public double TravelSeconds { get; init; }
        public double DistanceKm { get; init; }

        private double? _weight;
        public double Weight
        {
            get => _weight ?? TravelSeconds;
            init => _weight = value;
        }
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

        public void AddNode(GraphNode node) => _nodes[node.Id] = node;

        public List<GraphNode> GetNodes() => _nodes.Values.ToList();

        public GraphNode? GetNode(int id) => _nodes.TryGetValue(id, out var node) ? node : null;

        public void AddEdge(int fromId, int toId, double travelSeconds)
        {
            if (fromId == toId) return;
            if (!_nodes.TryGetValue(fromId, out var from)) return;
            if (!_nodes.TryGetValue(toId, out var to)) return;

            var distKm = Haversine(from.LocationX, from.LocationY, to.LocationX, to.LocationY);

            from.Edges.Add(new GraphEdge
            {
                TargetId = toId,
                TravelSeconds = travelSeconds,
                DistanceKm = distKm
            });
        }

        public GraphEdge? GetShortestEdge(int fromId, int toId)
            => _nodes.TryGetValue(fromId, out var node)
                ? node.Edges.FirstOrDefault(e => e.TargetId == toId)
                : null;

        #endregion

        #region Dijkstra

        public Dictionary<int, double> Dijkstra(int startId)
        {
            var distances = _nodes.Keys.ToDictionary(k => k, _ => double.MaxValue);

            if (!distances.ContainsKey(startId))
                return distances;

            distances[startId] = 0;

            var queue = new SortedSet<(double Distance, int Id)>(
                Comparer<(double, int)>.Create((a, b) =>
                    a.Item1 != b.Item1
                        ? a.Item1.CompareTo(b.Item1)
                        : a.Item2.CompareTo(b.Item2)));

            queue.Add((0, startId));

            while (queue.Count > 0)
            {
                var (currentDist, nodeId) = queue.Min;
                queue.Remove(queue.Min);

                if (currentDist > distances[nodeId]) continue;

                foreach (var edge in _nodes[nodeId].Edges)
                {
                    var newDist = currentDist + edge.Weight;
                    if (newDist >= distances[edge.TargetId]) continue;

                    distances[edge.TargetId] = newDist;
                    queue.Add((newDist, edge.TargetId));
                }
            }

            return distances;
        }

        #endregion
    }

    #endregion
}