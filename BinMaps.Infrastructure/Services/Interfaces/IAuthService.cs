using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IAuthService
    {
        Task<(bool success, IEnumerable<string> errors)> RegisterAsync(RegisterDTO dto);

        Task<(bool success,string role )> LoginAsync(LoginDTO dto);

    }
}
