using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;

using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        private readonly UserManager<User> _userManager;

        private readonly SignInManager<User> _signInManager;

        public AuthService(UserManager<User> userManager, SignInManager<User> signInManager)
        {
            _userManager = userManager;
            _signInManager = signInManager;
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
                return (false, new List<string> { "DuplicateUserName" }); // Key word
            }

            if (await _userManager.FindByEmailAsync(dto.Email) != null)
            {
                return (false, new List<string> { "DuplicateEmail" }); // Key word
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

        public async Task<(bool success, string role)> LoginAsync(LoginDTO dto)
        {
            var user = await _userManager.FindByEmailAsync(dto.Email);
            if (user == null)
            {
                return (false, null);
            }

            var result = await _signInManager.CheckPasswordSignInAsync(user, dto.Password, false);

            if (!result.Succeeded)
            {
                return (false,  null);
            }

            var roles = await _userManager.GetRolesAsync(user);

            return (true, roles.FirstOrDefault());
        }
    }

}
