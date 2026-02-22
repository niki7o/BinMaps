using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;

namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IAIService
{
    Task<AIResultDto?> AnalyzeAsync(IFormFile photo);
}