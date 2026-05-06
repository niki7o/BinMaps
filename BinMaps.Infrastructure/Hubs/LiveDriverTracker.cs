using System.Collections.Concurrent;

namespace BinMaps.Infrastructure.Hubs;

public sealed class LiveDriverTracker
{
    public static readonly TimeSpan EntryTtl = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, LiveDriverEntry> _byDriver
        = new(StringComparer.Ordinal);

    public void Upsert(LiveDriverEntry entry)
    {
        if (string.IsNullOrEmpty(entry.DriverId)) return;
        _byDriver[entry.DriverId] = entry;
    }
    public void Remove(string driverId)
    {
        if (string.IsNullOrEmpty(driverId)) return;
        _byDriver.TryRemove(driverId, out _);
    }

    public IReadOnlyList<LiveDriverEntry> Snapshot()
    {
        var cutoff = DateTime.UtcNow - EntryTtl;
        var result = new List<LiveDriverEntry>(_byDriver.Count);
        foreach (var kv in _byDriver)
        {
            if (kv.Value.At >= cutoff) result.Add(kv.Value);
            else _byDriver.TryRemove(kv.Key, out _);
        }
        return result;
    }
}

public sealed class LiveDriverEntry
{
    public string   DriverId    { get; set; } = "";
    public string   DriverName  { get; set; } = "";
    public int      RunId       { get; set; }
    public string   AreaId      { get; set; } = "";
    public double   Lat         { get; set; }
    public double   Lng         { get; set; }
    public double   Heading     { get; set; }
    public double   SpeedKmh    { get; set; }
    public int      StopIndex   { get; set; }
    public int      TotalStops  { get; set; }
    public double   Load        { get; set; }
    public string   Phase       { get; set; } = "move";
    public DateTime At          { get; set; }
}
