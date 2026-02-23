namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IReputationService
{
    Task IncrementAsync(string userId, int delta = 10);
    Task DecrementAsync(string userId, int delta = 5);
    string GetLevel(int reputation);
    int GetNextLevelThreshold(string level);
}