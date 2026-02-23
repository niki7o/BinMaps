using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IAuthService
    {
        Task<(bool Success, IEnumerable<string> Errors)> RegisterAsync(RegisterDTO dto);
        Task<(bool Success, AuthResultDto? Result)> LoginAsync(LoginDTO dto);
    }
}
