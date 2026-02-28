using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.Identity;

namespace BinMaps.Infrastructure.Services;

public sealed class ReputationService : IReputationService
{
    private readonly UserManager<User> _userManager;

    public ReputationService(UserManager<User> userManager)
    {
        _userManager = userManager;
    }

    #region Mutation

    public async Task IncrementAsync(string userId, int delta = 5)
    {
        var user = await _userManager.FindByIdAsync(userId)
            ?? throw new InvalidOperationException($"User {userId} not found.");

        user.Reputation = Math.Clamp(user.Reputation + delta, 0, 100);
        await _userManager.UpdateAsync(user);
    }

    public async Task DecrementAsync(string userId, int delta = 10)
    {
        var user = await _userManager.FindByIdAsync(userId)
            ?? throw new InvalidOperationException($"User {userId} not found.");

        user.Reputation = Math.Clamp(user.Reputation - delta, 0, 100);
        await _userManager.UpdateAsync(user);
    }

    #endregion

    #region Computation

    public string GetLevel(int reputation) => reputation switch
    {
        >= 80 => "Елитен",
        >= 60 => "Верен",
        >= 40 => "Активен",
        >= 20 => "Новак",
        _ => ""
    };

    public int GetNextLevelThreshold(string level) => level switch
    {
        "" => 20,
        "Новак" => 40,
        "Активен" => 60,
        "Верен" => 80,
        _ => 100
    };

    #endregion
}