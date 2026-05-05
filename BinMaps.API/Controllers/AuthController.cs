using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    #region Endpoints

    [HttpPost("register")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Register([FromBody] RegisterDTO dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var (success, errors) = await _authService.RegisterAsync(dto);

        if (!success)
            return BadRequest(new { errors });

        return Ok(new { message = "Регистрацията е успешна." });
    }

    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginDTO dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var (success, result) = await _authService.LoginAsync(dto);

        if (!success || result is null)
            return Unauthorized(new { message = "Невалиден имейл или парола." });
        return Ok(result);
    }

    /// <summary>
    /// Issues a fresh JWT for the currently-authenticated user, picking up
    /// any role change that an admin may have made since the last login.
    /// The frontend calls this on profile load / after an admin changes the
    /// user's role, so the token (and UI) reflect the current database state.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var result = await _authService.RefreshCurrentUserAsync(userId);
        return result is null
            ? Unauthorized(new { message = "Потребителят не е намерен." })
            : Ok(result);
    }

    #endregion
}