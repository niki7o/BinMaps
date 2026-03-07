using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace BinMaps.Infrastructure.Services;

public sealed class OpenWeatherService : IExternalWeatherService
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);
    private const string CacheKeyPrefix = "omt_temp_";

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<OpenWeatherService> _logger;

    public OpenWeatherService(
        HttpClient http,
        IMemoryCache cache,
        ILogger<OpenWeatherService> logger)
    {
        _http = http;
        _cache  = cache;
        _logger = logger;
    }

    public async Task<double?> GetAmbientTemperatureAsync(double lat, double lng)
    {
        var cacheKey = $"{CacheKeyPrefix}{lat:F4}_{lng:F4}";

        if (_cache.TryGetValue(cacheKey, out double cached))
            return cached;

        try
        {
            var url = $"https://api.open-meteo.com/v1/forecast"
                    + $"?latitude={lat:F6}&longitude={lng:F6}&current=temperature_2m";

            var response = await _http.GetFromJsonAsync<OmtResponse>(url);

            if (response?.Current?.Temperature2m is null)
                return null;

            _cache.Set(cacheKey, response.Current.Temperature2m.Value, CacheDuration);
            return response.Current.Temperature2m.Value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Open-Meteo failed for ({Lat},{Lng}). Using fallback.", lat, lng);
            return null;
        }
    }

    private sealed class OmtResponse
    {
        [JsonPropertyName("current")]
        public OmtCurrent? Current { get; init; }
    }

    private sealed class OmtCurrent
    {
        [JsonPropertyName("temperature_2m")]
        public double? Temperature2m { get; init; }
    }
}