using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure;

public sealed class FillageSimulator
{
    #region Fill

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

    #endregion

    #region Temperature

    public double SimulateTemperature(TrashContainer container, double ambientCelsius)
    {
        var organicHeat = container.TrashType == TrashType.Mixed
            ? container.FillPercentage * 0.15
            : 0;

        var variation = (Random.Shared.NextDouble() * 4) - 2;
        return Math.Clamp(ambientCelsius + organicHeat + variation, 10, 60);
    }

    #endregion

    #region Battery

    public static double CalculateBatteryDrain(TrashContainer container)
        => 0.002 * (container.Temperature > 30 ? 1.3 : 1.0);

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

    #region Misc

    public static double GetEmptyFillLevel()
        => 2.0 + Random.Shared.NextDouble() * 6.0;

    #endregion
}