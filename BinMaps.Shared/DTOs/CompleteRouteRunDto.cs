namespace BinMaps.Shared.DTOs;


public sealed class CompleteRouteRunDto
{
    public int StopsCompleted { get; init; }
    public double CollectedLoad { get; init; }

    
    public string? Outcome { get; init; }

   
    public List<int>? VisitedContainerIds { get; init; }
}
