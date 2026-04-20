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
}
