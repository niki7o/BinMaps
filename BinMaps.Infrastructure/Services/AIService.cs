using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace BinMaps.Infrastructure.Services
{
    public class AIService : IAIService

    {
        private readonly HttpClient _httpClient;
        private readonly string _endpoint;

        public AIService(IHttpClientFactory factory, IConfiguration config)
        {
            _httpClient = factory.CreateClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(30); 
            _endpoint = config["AISettings:Endpoint"];
        }

        public async Task<AIResultDto> AnalyzeAsync(IFormFile photo)
        {
            if (photo == null || photo.Length == 0)
                throw new ArgumentException("Няма снимка");

            using var content = new MultipartFormDataContent();
            using var fileContent = new StreamContent(photo.OpenReadStream());
            fileContent.Headers.ContentType = new MediaTypeHeaderValue(photo.ContentType);
            content.Add(fileContent, "photo", photo.FileName);

            var response = await _httpClient.PostAsync(_endpoint, content);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                throw new Exception($"AI грешка: {response.StatusCode} - {error}");
            }

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<AIResultDto>(json);
        }
    }
}
