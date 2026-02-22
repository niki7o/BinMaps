using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Headers;
using System.Text.Json;

namespace BinMaps.Infrastructure.Services;

public sealed class AIService : IAIService
{
    private readonly HttpClient _httpClient;
    private readonly string _endpoint;

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public AIService(IHttpClientFactory factory, IConfiguration config)
    {
        _httpClient = factory.CreateClient("AIClient");
        _endpoint = config["AISettings:Endpoint"]
            ?? throw new InvalidOperationException("AISettings:Endpoint is not configured.");
    }
    #region Analyze
    public async Task<AIResultDto?> AnalyzeAsync(IFormFile photo)
    {
        if (photo is null || photo.Length == 0)
            return null;

        using var form = new MultipartFormDataContent();
        await using var stream = photo.OpenReadStream();
        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(photo.ContentType);
        form.Add(fileContent, "photo", photo.FileName);

        var response = await _httpClient.PostAsync(_endpoint, form);
        if (!response.IsSuccessStatusCode) 
            return null;

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<AIResultDto>(json, JsonOptions);
    }
    #endregion
}