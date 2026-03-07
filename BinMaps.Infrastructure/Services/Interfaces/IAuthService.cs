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
        /// Returns (Success, Result). On valid credentials Result is always non-null.
        /// When the account is banned Result.IsBanned=true and Result.BanReason is set;
        /// a JWT token is still issued so the frontend can display the ban page.
        /// </summary>
        Task<(bool Success, AuthResultDto? Result)> LoginAsync(LoginDTO dto);
    }
}
