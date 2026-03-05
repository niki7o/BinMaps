using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace BinMaps.Infrastructure.Services;

public sealed class OpenWeatherService : IExternalWeatherService
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);
    private const string CacheKeyPrefix = "owm_temp_";

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<OpenWeatherService> _logger;
    private readonly string _apiKey;

    public OpenWeatherService(
        HttpClient http,
        IMemoryCache cache,
        IConfiguration config,
        ILogger<OpenWeatherService> logger)
    {
        _http = http;
        _cache = cache;
        _logger = logger;
        _apiKey = config["ExternalAPIs:OpenWeatherMap:ApiKey"]
            ?? throw new InvalidOperationException("ExternalAPIs:OpenWeatherMap:ApiKey not configured.");
    }

    #region IExternalWeatherService

    public async Task<double?> GetAmbientTemperatureAsync(double lat, double lng)
    {
        var cacheKey = $"{CacheKeyPrefix}{lat:F4}_{lng:F4}";

        if (_cache.TryGetValue(cacheKey, out double cached))
            return cached;

        try
        {
            var url = $"https://api.openweathermap.org/data/2.5/weather"
                    + $"?lat={lat:F6}&lon={lng:F6}&appid={_apiKey}&units=metric";

            var response = await _http.GetFromJsonAsync<OwmResponse>(url);

            if (response?.Main?.Temp is null)
                return null;

            _cache.Set(cacheKey, response.Main.Temp.Value, CacheDuration);
            return response.Main.Temp.Value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenWeatherMap failed for ({Lat},{Lng}). Using fallback.", lat, lng);
            return null;
        }
    }

    #endregion

    #region Response Models

    private sealed class OwmResponse
    {
        [JsonPropertyName("main")]
        public OwmMain? Main { get; init; }
    }

    private sealed class OwmMain
    {
        [JsonPropertyName("temp")]
        public double? Temp { get; init; }
    }

    #endregion
}