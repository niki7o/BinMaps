using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IAuthService
    {
        Task<(bool Success, IEnumerable<string> Errors)> RegisterAsync(RegisterDTO dto);
        /// <summary>
        /// Returns (Success, IsBanned, BanReason, Result).
        /// IsBanned=true means valid credentials but account is suspended.
        /// </summary>
        Task<(bool Success, bool IsBanned, string? BanReason, AuthResultDto? Result)> LoginAsync(LoginDTO dto);
    }
}
