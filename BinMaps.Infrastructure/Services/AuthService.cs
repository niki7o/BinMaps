using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace BinMaps.Infrastructure.Services;

public sealed class AuthService : IAuthService
{
    private readonly UserManager<User> _userManager;
    private readonly SignInManager<User> _signInManager;
    private readonly IConfiguration _config;

    public AuthService(
        UserManager<User> userManager,
        SignInManager<User> signInManager,
        IConfiguration config)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _config = config;
    }

    #region Public


    public async Task<(bool Success, IEnumerable<string> Errors)> RegisterAsync(RegisterDTO dto)
    {
        if (!dto.AcceptTerms)
            return (false, new[] { "Трябва да приемете условията за ползване." });

        if (await _userManager.Users.AnyAsync(u => u.Email == dto.Email))
            return (false, new[] { "Имейлът вече е зает." });

        if (await _userManager.FindByNameAsync(dto.UserName) is not null)
            return (false, new[] { "Потребителското име вече е заето." });

        var user = new User
        {
            UserName = dto.UserName,
            Email = dto.Email,
            PhoneNumber = dto.PhoneNumber,
            Reputation = 0
        };

        var result = await _userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
            return (false, result.Errors.Select(e => e.Description));

        await _userManager.AddToRoleAsync(user, "User");
        return (true, Enumerable.Empty<string>());
    }



    public async Task<(bool Success, AuthResultDto? Result)> LoginAsync(LoginDTO dto)
    {
        var user = await _userManager.FindByEmailAsync(dto.Email);
        if (user is null)
            return (false, null);

        // Use CheckPasswordAsync (not SignInManager) so that locked-out users are
        // not rejected here — we still want to issue a token and let the frontend
        // show the ban page. SignInManager.CheckPasswordSignInAsync returns LockedOut
        // (not Succeeded) for locked accounts even with lockoutOnFailure:false.
        var passwordValid = await _userManager.CheckPasswordAsync(user, dto.Password);
        if (!passwordValid)
            return (false, null);

        var roles = await _userManager.GetRolesAsync(user);
        var role  = roles.FirstOrDefault() ?? "User";
        var token = GenerateJwtToken(user, role);

        // Ban detection: LockoutEnd = DateTimeOffset.MaxValue means banned.
        // Admins are never blocked. We still issue a token so the frontend can
        // show the ban page with context; Angular guards block all other routes.
        var isBanned  = role != "Admin" && user.LockoutEnd.HasValue && user.LockoutEnd > DateTimeOffset.UtcNow;
        string? banReason = null;
        if (isBanned)
        {
            var userClaims = await _userManager.GetClaimsAsync(user);
            banReason = userClaims.FirstOrDefault(c => c.Type == "ban_reason")?.Value;
        }

        return (true, new AuthResultDto
        {
            Token     = token,
            UserId    = user.Id,
            UserName  = user.UserName!,
            Email     = user.Email!,
            Role      = role,
            Reputation = user.Reputation,
            IsBanned  = isBanned,
            BanReason = banReason
        });
    }

    #endregion

    #region Private

    private string GenerateJwtToken(User user, string role)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? _config["Jwt:Key"]
            ?? throw new InvalidOperationException("JWT secret is not configured.");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddDays(
            int.TryParse(_config["Jwt:ExpireDays"], out var days) ? days : 7);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,        user.Id),
            new Claim(JwtRegisteredClaimNames.Email,      user.Email!),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName!),
            new Claim(ClaimTypes.Role,                    role),
            new Claim(JwtRegisteredClaimNames.Jti,        Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    #endregion
}