using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
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

        var (success, isBanned, banReason, result) = await _authService.LoginAsync(dto);

        if (!success)
            return Unauthorized(new { message = "Невалиден имейл или парола." });

        if (isBanned)
            return StatusCode(StatusCodes.Status403Forbidden,
                new { code = "BANNED", banReason = banReason ?? "Нямате достъп до системата." });

        return Ok(result);
    }

    #endregion
}