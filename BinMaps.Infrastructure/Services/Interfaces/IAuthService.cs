using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IAuthService
{
    Task<(bool Success, IEnumerable<string> Errors)> RegisterAsync(RegisterDTO dto);
    Task<(bool Success, string? Role, string? Token)> LoginAsync(LoginDTO dto);
}