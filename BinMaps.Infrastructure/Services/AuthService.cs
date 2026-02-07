using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.AccessControl;
using System.Security.Claims;
using System.Text;

namespace BinMaps.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        private readonly UserManager<User> _userManager;

        private readonly SignInManager<User> _signInManager;
        private readonly IConfiguration _config;

        public AuthService(UserManager<User> userManager, SignInManager<User> signInManager, IConfiguration config)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _config = config;
        }


        private string GenerateJwtToken(User user, string role)
        {
            var claims = new List<Claim>
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id),
        new Claim(JwtRegisteredClaimNames.Email, user.Email),
        new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName),
        new Claim(ClaimTypes.Role, role ?? "User")
    };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddDays(double.Parse(_config["Jwt:ExpireDays"])),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }


        public async Task<(bool success, IEnumerable<string> errors)> RegisterAsync(RegisterDTO dto)
        {

            var userExists = await _userManager.Users.AnyAsync(u => u.Email == dto.Email);
            if (userExists)
            {

                return (false, new List<string> { "Този имейл вече е зает." });
            }
            if (await _userManager.FindByNameAsync(dto.UserName) != null)
            {
                return (false, new List<string> { "DuplicateUserName" }); 
            }

            if (await _userManager.FindByEmailAsync(dto.Email) != null)
            {
                return (false, new List<string> { "DuplicateEmail" }); 
            }
            if (!dto.AcceptTerms)
    {
        return (false, new List<string> { "Трябва да приемете условията за ползване." });
    }

    var user = new User
    {
        UserName = dto.UserName,
        Email = dto.Email,
        PhoneNumber = dto.PhoneNumber?.ToString()
    };
          

            var result = await _userManager.CreateAsync(user, dto.Password);

    if (!result.Succeeded)
    {
      
        return (false, result.Errors.Select(e => e.Description));
    }

    await _userManager.AddToRoleAsync(user, "User");
    return (true, null);
}

        public async Task<(bool success, string role, string token)> LoginAsync(LoginDTO dto)
        {
            var user = await _userManager.FindByEmailAsync(dto.Email);
            if (user == null) 
                return (false, null, null);

            var result = await _signInManager.CheckPasswordSignInAsync(user, dto.Password, false);
            if (!result.Succeeded) 
                return (false, null, null);

            var roles = await _userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault();

            var token = GenerateJwtToken(user, role);
            return (true, role, token);
        }
    }

}
