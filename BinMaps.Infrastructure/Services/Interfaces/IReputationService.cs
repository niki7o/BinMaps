namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IReputationService
{
    Task IncrementAsync(string userId, int points = 10);
    Task DecrementAsync(string userId, int points = 5);
    int Calculate(int approvedReports, int totalReports);
    string GetLevel(int reputation);
    int GetNextLevelThreshold(string level);
}