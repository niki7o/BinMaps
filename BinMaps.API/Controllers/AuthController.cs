using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;

        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDTO dto)
        {
            var success = await _authService.RegisterAsync(dto);

            if (!success)
            {
                return BadRequest("Registration failed");
            }

            return Ok("Registered");
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginDTO dto)
        {
            var (success, role) = await _authService.LoginAsync(dto);

            if (!success)
            {
                return Unauthorized();
            }
            return Ok(new
            {
                dto.Email,
                Role = role
            });
        }
    }

}
