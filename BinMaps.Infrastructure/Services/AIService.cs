using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Text.Json;

namespace BinMaps.Infrastructure.Services;

public sealed class AIService : IAIService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<AIService> _logger;

    public AIService(HttpClient http, IConfiguration config, ILogger<AIService> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    #region Public

    public async Task<AIResultDto?> AnalyzeAsync(IFormFile photo)
    {
        var endpoint = _config["AISettings:Endpoint"];
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            _logger.LogWarning("AI endpoint not configured.");
            return null;
        }

        try
        {
            using var content = new MultipartFormDataContent();
            await using var stream = photo.OpenReadStream();
            var fileContent = new StreamContent(stream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue(photo.ContentType);
            content.Add(fileContent, "file", photo.FileName);

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var response = await _http.PostAsync(endpoint, content, cts.Token);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("AI service returned {StatusCode}.", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cts.Token);

            return JsonSerializer.Deserialize<AIResultDto>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("AI service timed out.");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI service call failed.");
            return null;
        }
    }

    #endregion
}