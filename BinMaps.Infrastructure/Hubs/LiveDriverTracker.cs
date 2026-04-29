using System.Collections.Concurrent;

namespace BinMaps.Infrastructure.Hubs;

/// <summary>
/// In-memory store of the last-known position for every active driver.
/// Updated whenever <see cref="ContainerHub.DriverPosition"/> fires; consumed
/// by the snapshot endpoint that catches up newly-arrived clients.
///
/// Registered as a singleton so the hub (transient per-connection) and the
/// API controller share the same dictionary instance.
///
/// Eviction:
///   • A driver sending phase="end" is removed immediately.
///   • Otherwise stale entries time out after <see cref="EntryTtl"/> so a
///     truck that crashed mid-route doesn't haunt the map forever.
/// </summary>
public sealed class LiveDriverTracker
{
    public static readonly TimeSpan EntryTtl = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, LiveDriverEntry> _byDriver
        = new(StringComparer.Ordinal);

    /// <summary>Insert or update the position for a driver.</summary>
    public void Upsert(LiveDriverEntry entry)
    {
        if (string.IsNullOrEmpty(entry.DriverId)) return;
        _byDriver[entry.DriverId] = entry;
    }

    /// <summary>Drop a driver from the live set (route ended/cancelled).</summary>
    public void Remove(string driverId)
    {
        if (string.IsNullOrEmpty(driverId)) return;
        _byDriver.TryRemove(driverId, out _);
    }

    /// <summary>
    /// Snapshot of every still-fresh driver entry. Stale entries are filtered
    /// out lazily here so we don't need a background timer.
    /// </summary>
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

/// <summary>One driver's last-known telemetry. Public DTO — also serialised
/// directly by the snapshot endpoint, so property names map 1:1 to JSON.</summary>
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
