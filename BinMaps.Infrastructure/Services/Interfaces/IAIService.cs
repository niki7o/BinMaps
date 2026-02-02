using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IAIService
    {
        Task<AIResultDto> AnalyzeAsync(IFormFile photo);
    }
}
