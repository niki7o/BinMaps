using BinMaps.Data.Entities;
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

    public async Task IncrementAsync(string userId, int points = 10)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return;
        }
        user.Reputation = Math.Max(0, user.Reputation + points);
        await _userManager.UpdateAsync(user);
    }

    public async Task DecrementAsync(string userId, int points = 5)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return;
        }
        user.Reputation = Math.Max(0, user.Reputation - points);
        await _userManager.UpdateAsync(user);
    }

    #endregion

    #region Calculation

    public int Calculate(int approvedReports, int totalReports)
    {
        if (totalReports == 0)
        {
            return 0;
        }
        var basePoints = approvedReports * 10;
        var accuracy = (double)approvedReports / totalReports;

        var accuracyBonus = accuracy switch
        {
            >= 0.90 => (int)(basePoints * 0.50),
            >= 0.80 => (int)(basePoints * 0.30),
            >= 0.70 => (int)(basePoints * 0.10),
            _ => 0
        };

        var volumeBonus = totalReports switch
        {
            >= 100 => 100,
            >= 50 => 50,
            >= 25 => 25,
            _ => 0
        };

        return basePoints + accuracyBonus + volumeBonus;
    }

    public string GetLevel(int reputation) => reputation switch
    {
        >= 1000 => "Легенда",
        >= 500 => "Експерт",
        >= 250 => "Професионалист",
        >= 100 => "Опитен",
        >= 50 => "Активен",
        _ => "Начинаещ"
    };

    public int GetNextLevelThreshold(string level) => level switch
    {
        "Начинаещ" => 50,
        "Активен" => 100,
        "Опитен" => 250,
        "Професионалист" => 500,
        "Експерт" => 1000,
        _ => 0
    };

    #endregion
}