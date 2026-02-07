using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace BinMaps.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly UserManager<User> _userManager;
        private readonly IConfiguration _config;

        public AuthController(IAuthService authService, UserManager<User> userManager, IConfiguration config)
        {
            _authService = authService;
            _userManager = userManager;
            _config = config;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDTO dto)
        {
            var (success, errors) = await _authService.RegisterAsync(dto);

            if (!success)
            {
                var errorDict = new Dictionary<string, string[]>();
                foreach (var error in errors)
                {
                    if (error.Contains("DuplicateUserName"))
                        errorDict.Add("userName", new[] { "Това потребителско име вече е заето." });
                    else if (error.Contains("DuplicateEmail"))
                        errorDict.Add("email", new[] { "Този имейл вече е регистриран." });
                    else
                        errorDict.Add("general", new[] { error });
                }
                return BadRequest(new { errors = errorDict });
            }

            return Ok(new { message = "Регистрацията е успешна!" });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDTO dto)
        {
           
            var (success, role, token) = await _authService.LoginAsync(dto);

            if (!success)
            {
                return BadRequest(new
                {
                    errors = new Dictionary<string, string[]> {
                { "email", new[] { "Грешен имейл или парола." } }
            }
                });
            }

           
            var user = await _userManager.FindByEmailAsync(dto.Email);

            return Ok(new
            {
                token,
                user = new
                {
                    user.Id,
                    user.UserName,
                    user.Email,
                    role
                }
            });
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            var userId = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return Unauthorized();

            var roles = await _userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "User";

            return Ok(new
            {
                id = user.Id,
                email = user.Email,
                userName = user.UserName,
                role = role
            });
        }
    }
}
