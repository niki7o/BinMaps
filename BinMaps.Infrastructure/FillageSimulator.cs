using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure;

public sealed class FillageSimulator
{
    public double CalculateFillIncrement(TrashContainer container, double zoneMultiplier)
    {
        var slowdown = container.FillPercentage switch
        {
            > 85 => 0.4,
            > 65 => 0.7,
            _ => 1.0
        };

        return 0.8
            * zoneMultiplier
            * GetTypeMultiplier(container.TrashType)
            * GetTimeMultiplier()
            * (0.8 + Random.Shared.NextDouble() * 0.4)
            * slowdown;
    }

    private static double GetTypeMultiplier(TrashType type) => type switch
    {
        TrashType.Mixed => 1.5,
        TrashType.Plastic => 1.2,
        TrashType.Paper => 1.0,
        TrashType.Glass => 0.8,
        _ => 1.0
    };

    private static double GetTimeMultiplier()
    {
        var h = DateTime.Now.Hour;
        return h is (>= 8 and < 10) or (>= 12 and < 14) or (>= 18 and < 21) ? 1.5
             : h >= 22 || h < 6 ? 0.5
             : 1.0;
    }

    public double SimulateTemperature(TrashContainer container, double ambientCelsius)
    {
        var fill = container.FillPercentage / 100.0;

        var heatRise = container.TrashType switch
        {
            TrashType.Mixed => fill * 15.0,
            TrashType.Plastic => fill * 6.0,
            TrashType.Paper => fill * 5.0,
            TrashType.Glass => fill * 2.0,
            _ => fill * 5.0
        };

        var variation = (Random.Shared.NextDouble() * 4) - 2;
        return Math.Clamp(ambientCelsius + heatRise + variation, -20, 58);
    }

    public static double CalculateBatteryDrain(TrashContainer container)
        => 0.002 * (container.Temperature > 30 ? 1.3 : 1.0);

    public static TrashContainerStatus DetermineStatus(TrashContainer container)
    {
        if (container.Temperature > 55 && container.FillPercentage > 70)
            return TrashContainerStatus.Fire;

        if (container.HasSensor && container.BatteryPercentage is < 10)
            return TrashContainerStatus.SensorBroken;

        return TrashContainerStatus.Active;
    }

    public static double GetEmptyFillLevel()
        => 2.0 + Random.Shared.NextDouble() * 6.0;
}
