namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IExternalRoutingService
{
    Task<RouteMatrix?> GetMatrixAsync(
        IReadOnlyList<GeoCoordinate> origins,
        IReadOnlyList<GeoCoordinate> destinations);
}

public sealed record GeoCoordinate(double Lat, double Lng);

public sealed record RouteMatrix(IReadOnlyDictionary<(int Origin, int Destination), RouteLeg> Legs);

public sealed record RouteLeg(double DistanceMeters, double TravelTimeSeconds)
{
    public double DistanceKm => DistanceMeters / 1000.0;
    public double TravelTimeMinutes => TravelTimeSeconds / 60.0;
}