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
        public async Task<IActionResult> Register(RegisterDTO dto)
        {
            var (success, errors) = await _authService.RegisterAsync(dto);

            if (!success)
            {
                var modelState = new Dictionary<string, string[]>();

                foreach (var error in errors)
                {
                    if (error.Contains("UserName"))
                        modelState["userName"] = new[] { "Това име е заето." };

                    else if (error.Contains("Email"))
                        modelState["email"] = new[] { "Имейлът вече съществува." };

                    else
                        modelState["general"] = new[] { error };
                }

                return BadRequest(new { errors = modelState });
            }

            return Ok();
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
