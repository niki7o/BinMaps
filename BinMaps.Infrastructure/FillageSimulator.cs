using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure;

public sealed class FillageSimulator
{
    private readonly Random _random = new();

    #region Fill

    public double CalculateFillIncrement(TrashContainer container, double zoneMultiplier)
    {
        var increment = 0.8
            * zoneMultiplier
            * GetTypeMultiplier(container.TrashType)
            * GetTimeMultiplier()
            * (0.8 + _random.NextDouble() * 0.4);

        if (container.FillPercentage > 85) increment *= 0.4;
        else if (container.FillPercentage > 65) increment *= 0.7;

        return increment;
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
        var hour = DateTime.Now.Hour;
        if ((hour >= 8 && hour < 10) || (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21)) return 1.5;
        if (hour >= 22 || hour < 6) return 0.5;
        return 1.0;
    }

    #endregion

    #region Temperature

    public double SimulateTemperature(TrashContainer container)
    {
        var ambient = 15 + _random.NextDouble() * 10;
        var organicHeat = container.TrashType == TrashType.Mixed ? container.FillPercentage * 0.15 : 0;
        var seasonal = DateTime.Now.Month is >= 6 and <= 8 ? 5.0 : 0.0;
        var variation = -2 + _random.NextDouble() * 4;

        return Math.Clamp(ambient + organicHeat + seasonal + variation, 10, 60);
    }

    #endregion

    #region Battery

    public double CalculateBatteryDrain(TrashContainer container)
    {
        var tempFactor = container.Temperature > 30 ? 1.3 : 1.0;
        return 0.002 * tempFactor;
    }

    #endregion

    #region Status

    public static TrashContainerStatus DetermineStatus(TrashContainer container)
    {
        if (container.Temperature > 55 && container.FillPercentage > 70)
            return TrashContainerStatus.Fire;

        if (container.HasSensor && container.BatteryPercentage is < 10)
            return TrashContainerStatus.SensorBroken;

        return TrashContainerStatus.Active;
    }

    #endregion

    public double GetEmptyFillLevel() => 2.0 + _random.NextDouble() * 6.0;
}