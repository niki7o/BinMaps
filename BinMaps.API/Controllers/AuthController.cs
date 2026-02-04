using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;


    namespace BinMaps.API.Controllers
    {
        [Route("api/[controller]")]
        [ApiController]
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
                var (success, errors) = await _authService.RegisterAsync(dto);

                if (!success)
                {
                    var errorDict = new Dictionary<string, string[]>();

                    // Handle specific error messages
                    foreach (var error in errors)
                    {
                        if (error.Contains("DuplicateUserName"))
                        {
                            errorDict.Add("userName", new[] { "Това потребителско име вече е заето." });
                        }
                        else if (error.Contains("DuplicateEmail"))
                        {
                            errorDict.Add("email", new[] { "Този имейл вече е регистриран." });
                        }
                        else
                        {
                            errorDict.Add("general", new[] { error });
                        }
                    }

                    return BadRequest(new { errors = errorDict });
                }

                return Ok(new { message = "Регистрацията е успешна!" });
            }

            [HttpPost("login")]
            public async Task<IActionResult> Login([FromBody] LoginDTO dto)
            {
                var (success, role) = await _authService.LoginAsync(dto);

                if (!success)
                {
                    return BadRequest(new
                    {
                        errors = new Dictionary<string, string[]> {
                        { "email", new[] { "Грешен имейл или парола." } }
                    }
                    });
                }

               
                var user = new
                {
                    email = dto.Email,
                    role = role ?? "User",
                    userName = dto.Email.Split('@')[0] 
                };

                return Ok(user);
            }

            [Authorize]
            [HttpGet("me")]
            public async Task<IActionResult> GetCurrentUser()
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var email = User.FindFirst(ClaimTypes.Email)?.Value;
                var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "User";

                return Ok(new
                {
                    id = userId,
                    email = email,
                    role = role,
                    userName = email?.Split('@')[0]
                });
            }
        }
    }


