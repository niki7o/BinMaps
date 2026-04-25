namespace BinMaps.Shared.DTOs;

/// <summary>
/// Sent by the driver UI when a collection route finishes
/// (successfully, cancelled, or partially).
/// </summary>
public sealed class CompleteRouteRunDto
{
    public int StopsCompleted { get; init; }
    public double CollectedLoad { get; init; }

    /// <summary>"completed" | "cancelled" — defaults to completed on the server.</summary>
    public string? Outcome { get; init; }

    /// <summary>
    /// IDs of containers actually emptied during this run. The server uses
    /// this to reset their fill % so the same route can't be re-generated
    /// immediately. Optional — when missing, the server falls back to the
    /// planned-stops snapshot (capped to StopsCompleted).
    /// </summary>
    public List<int>? VisitedContainerIds { get; init; }
}
