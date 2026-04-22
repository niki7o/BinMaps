using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.API.Seed;

/// <summary>
/// Generates realistic "collection point" clusters for seed data.
///
/// A cluster represents one physical kerbside waste-collection spot. Per
/// Bulgarian разделно събиране practice, each spot typically holds several
/// bins side-by-side (general / paper / plastic / glass). The generator
/// emits one bin of each selected <see cref="TrashType"/> per cluster,
/// placed with a small lat/lng offset so markers render next to each other
/// instead of on top of each other.
///
/// Why a generator and not a static JSON file:
///   * Hand-maintaining 400+ coordinates is error-prone and bloats the repo.
///   * Cluster topology is what makes the map look like a real city instead
///     of random scattered pins — this needs to be code, not data.
///   * Density is tunable per zone via <see cref="ZoneBoxes"/>.
/// </summary>
public sealed class ContainerClusterGenerator
{
    /// <summary>
    /// Bounding boxes per seed zone, derived from the existing
    /// containers.json so the generator stays geographically consistent
    /// with the original design. Values in decimal degrees (WGS84).
    /// Keys must match <c>Area.Id</c> exactly.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, ZoneBox> ZoneBoxes =
        new Dictionary<string, ZoneBox>
        {
            // (minLng, maxLng, minLat, maxLat, clusterCount)
            ["Зона 1 - Надежда север"] = new(23.295, 23.375, 42.700, 42.740, 20),
            ["Зона 2 - Център"]         = new(23.300, 23.355, 42.680, 42.715, 20),
            ["Зона 3 - Люлин"]          = new(23.255, 23.305, 42.690, 42.735, 20),
            ["Зона 4 - Овча Купел"]     = new(23.270, 23.305, 42.640, 42.690, 20),
            ["Зона 5 - Юг и Витоша"]    = new(23.290, 23.380, 42.640, 42.700, 25),
            ["Зона 6 - Изток"]          = new(23.350, 23.390, 42.660, 42.700, 15),
        };

    /// <summary>
    /// Types placed at every cluster. Real kerbside points in Sofia
    /// typically have general + paper + plastic + glass (4 bins).
    /// </summary>
    private static readonly TrashType[] ClusterBinTypes =
    {
        TrashType.Mixed,
        TrashType.Paper,
        TrashType.Plastic,
        TrashType.Glass,
    };

    /// <summary>
    /// Side-by-side offsets around a cluster centre (in degrees).
    /// ~0.00005° ≈ 5.5m at Sofia's latitude — close enough that the four
    /// markers read as a group in Leaflet but don't overlap.
    /// </summary>
    private static readonly (double DLng, double DLat)[] BinOffsets =
    {
        (-0.00005, -0.00005),
        ( 0.00005, -0.00005),
        (-0.00005,  0.00005),
        ( 0.00005,  0.00005),
    };

    private readonly Random _random;

    public ContainerClusterGenerator(Random random)
    {
        _random = random;
    }

    /// <summary>
    /// Produces a flat list of <see cref="TrashContainer"/> ready for
    /// <c>DbSet.AddRangeAsync</c>. Fill %, temperature, battery and
    /// status are left at defaults so the existing FillageSimulator
    /// will take over on the first background cycle.
    /// </summary>
    public IReadOnlyList<TrashContainer> Generate(IReadOnlyList<Area> areas)
    {
        var result = new List<TrashContainer>(capacity: 512);
        var id = 1;

        foreach (var area in areas)
        {
            if (!ZoneBoxes.TryGetValue(area.Id, out var box))
                continue;

            for (var c = 0; c < box.ClusterCount; c++)
            {
                var centerLng = box.MinLng + _random.NextDouble() * (box.MaxLng - box.MinLng);
                var centerLat = box.MinLat + _random.NextDouble() * (box.MaxLat - box.MinLat);

                for (var t = 0; t < ClusterBinTypes.Length; t++)
                {
                    var type = ClusterBinTypes[t];
                    var offset = BinOffsets[t];

                    // ~60% of bins have an IoT sensor. Mirrors a realistic
                    // rollout where not every bin in a cluster is smart yet.
                    var hasSensor = _random.NextDouble() < 0.6;

                    result.Add(new TrashContainer
                    {
                        Id                = id++,
                        AreaId            = area.Id,
                        TrashType         = type,
                        Capacity          = 1100,
                        LocationX         = centerLng + offset.DLng,
                        LocationY         = centerLat + offset.DLat,
                        HasSensor         = hasSensor,
                        Status            = TrashContainerStatus.Active,
                        FillPercentage    = InitialFill(area, type),
                        BatteryPercentage = hasSensor ? _random.Next(60, 101) : null,
                        Temperature       = null, // set by FillageSimulator
                        LastSensorReadAt  = hasSensor ? DateTime.UtcNow : null,
                        IsSeeded          = true,
                    });
                }
            }
        }

        return result;
    }

    /// <summary>
    /// Same spirit as <c>InitialStateSeeder.CalculateInitialFill</c> but
    /// scoped to generator needs — returns a plausible starting fill so
    /// the route page has things to collect immediately after seed.
    /// </summary>
    private double InitialFill(Area area, TrashType type)
    {
        var baseFill = area.ZoneMultiplier * 40.0;

        baseFill *= type switch
        {
            TrashType.Mixed   => 1.25,
            TrashType.Plastic => 1.10,
            TrashType.Paper   => 1.00,
            TrashType.Glass   => 0.85,
            _                 => 1.00,
        };

        baseFill += _random.Next(-10, 11);
        return Math.Clamp(baseFill, 5, 95);
    }

    private readonly record struct ZoneBox(
        double MinLng,
        double MaxLng,
        double MinLat,
        double MaxLat,
        int ClusterCount);
}
