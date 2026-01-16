using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;

using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.Text;

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

        public async Task<bool> RegisterAsync(RegisterDTO dto)
        {
            if (!dto.AcceptTerms)
            {
                return false;
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
                return false;
            }
            await _userManager.AddToRoleAsync(user, "User");
            return true;
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
