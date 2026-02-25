using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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
            Reputation = 50
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

        var signIn = await _signInManager.CheckPasswordSignInAsync(user, dto.Password, lockoutOnFailure: false);
        if (!signIn.Succeeded)
            return (false, null);

        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? "User";
        var token = GenerateJwtToken(user, role);

        return (true, new AuthResultDto
        {
            Token = token,
            UserId = user.Id,
            UserName = user.UserName!,
            Email = user.Email!,
            Role = role,
            Reputation = user.Reputation
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