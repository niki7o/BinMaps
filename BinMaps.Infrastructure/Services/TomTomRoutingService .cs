using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace BinMaps.Infrastructure.Services;

public sealed class TomTomRoutingService : IExternalRoutingService
{
    private const string MatrixEndpoint = "https://api.tomtom.com/routing/matrix/2";

    private readonly HttpClient _http;
    private readonly ILogger<TomTomRoutingService> _logger;
    private readonly string _apiKey;

    public TomTomRoutingService(
        HttpClient http,
        IConfiguration config,
        ILogger<TomTomRoutingService> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = config["ExternalAPIs:TomTom:ApiKey"]
            ?? throw new InvalidOperationException("ExternalAPIs:TomTom:ApiKey not configured.");
    }

    #region IExternalRoutingService

    public async Task<RouteMatrix?> GetMatrixAsync(
        IReadOnlyList<GeoCoordinate> origins,
        IReadOnlyList<GeoCoordinate> destinations)
    {
        if (origins.Count == 0 || destinations.Count == 0)
            return null;

        try
        {
            var url = $"{MatrixEndpoint}?key={_apiKey}&routeType=fastest&traffic=true&travelMode=truck";

            var body = new TomTomMatrixRequest
            {
                Origins = origins.Select(ToPoint).ToList(),
                Destinations = destinations.Select(ToPoint).ToList()
            };

            var httpResponse = await _http.PostAsJsonAsync(url, body);
            httpResponse.EnsureSuccessStatusCode();

            var result = await httpResponse.Content.ReadFromJsonAsync<TomTomMatrixResponse>();

            return result?.Matrix is null ? null : ParseMatrix(result.Matrix);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TomTom Matrix API failed. Haversine fallback will be used.");
            return null;
        }
    }

    #endregion

    #region Private

    private static TomTomPoint ToPoint(GeoCoordinate c)
        => new() { Point = new TomTomLatLng { Latitude = c.Lat, Longitude = c.Lng } };

    private static RouteMatrix ParseMatrix(List<List<TomTomCell>> matrix)
    {
        var legs = new Dictionary<(int, int), RouteLeg>();

        for (int i = 0; i < matrix.Count; i++)
        {
            for (int j = 0; j < matrix[i].Count; j++)
            {
                var cell = matrix[i][j];
                if (cell.StatusCode != 200 || cell.Response?.RouteSummary is null)
                    continue;

                legs[(i, j)] = new RouteLeg(
                    cell.Response.RouteSummary.LengthInMeters,
                    cell.Response.RouteSummary.TravelTimeInSeconds);
            }
        }

        return new RouteMatrix(legs);
    }

    #endregion

    #region Request Models

    private sealed class TomTomMatrixRequest
    {
        [JsonPropertyName("origins")]
        public List<TomTomPoint> Origins { get; init; } = new();

        [JsonPropertyName("destinations")]
        public List<TomTomPoint> Destinations { get; init; } = new();
    }

    private sealed class TomTomPoint
    {
        [JsonPropertyName("point")]
        public TomTomLatLng Point { get; init; } = new();
    }

    private sealed class TomTomLatLng
    {
        [JsonPropertyName("latitude")]
        public double Latitude { get; init; }

        [JsonPropertyName("longitude")]
        public double Longitude { get; init; }
    }

    #endregion

    #region Response Models

    private sealed class TomTomMatrixResponse
    {
        [JsonPropertyName("matrix")]
        public List<List<TomTomCell>>? Matrix { get; init; }
    }

    private sealed class TomTomCell
    {
        [JsonPropertyName("statusCode")]
        public int StatusCode { get; init; }

        [JsonPropertyName("response")]
        public TomTomCellResponse? Response { get; init; }
    }

    private sealed class TomTomCellResponse
    {
        [JsonPropertyName("routeSummary")]
        public TomTomRouteSummary? RouteSummary { get; init; }
    }

    private sealed class TomTomRouteSummary
    {
        [JsonPropertyName("lengthInMeters")]
        public double LengthInMeters { get; init; }

        [JsonPropertyName("travelTimeInSeconds")]
        public double TravelTimeInSeconds { get; init; }

        [JsonPropertyName("trafficDelayInSeconds")]
        public double TrafficDelayInSeconds { get; init; }
    }

    #endregion
}