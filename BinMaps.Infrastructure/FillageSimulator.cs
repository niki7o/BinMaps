using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure.Services
{
    public class FillageSimulator
    {
        private readonly Random _random = new Random();

        public double CalculateFillIncrement(TrashContainer container)
        {
           
            double baseIncrement = 0.8;

            // Zone multiplier — busier zones fill faster
            double zoneMultiplier = GetZoneMultiplier(container.AreaId);

            // Trash type multiplier
            double typeMultiplier = container.TrashType switch
            {
                TrashType.Mixed => 1.5,
                TrashType.Plastic => 1.2,
                TrashType.Paper => 1.0,
                TrashType.Glass => 0.8,
                _ => 1.0
            };

            // Time-of-day multiplier
            double timeMultiplier = GetTimeMultiplier();

           
            double randomFactor = 0.8 + (_random.NextDouble() * 0.4);

            double increment = baseIncrement * zoneMultiplier * typeMultiplier * timeMultiplier * randomFactor;

            // Slow down near full
            if (container.FillPercentage > 85)
                increment *= 0.4;
            else if (container.FillPercentage > 65)
                increment *= 0.7;

            return increment;
        }

        private double GetZoneMultiplier(string areaId)
        {
            return areaId switch
            {
                "Зона 2 - Център" => 2.0,
                "Зона 1 - Надежда север" => 1.5,
                "Зона 3 - Люлин" => 1.3,
                "Зона 6 - Изток" => 1.2,
                "Зона 4 - Овча Купел" => 1.0,
                "Зона 5 - Юг и Витоша" => 0.8,
                _ => 1.0
            };
        }

        private double GetTimeMultiplier()
        {
            int hour = DateTime.Now.Hour;

            if ((hour >= 8 && hour < 10) || (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21))
                return 1.5;
            else if (hour >= 22 || hour < 6)
                return 0.5; 
            else
                return 1.0;
        }

        public double SimulateTemperature(TrashContainer container)
        {
            double ambient = 15 + (_random.NextDouble() * 10);
            double organicHeat = container.TrashType == TrashType.Mixed
                ? container.FillPercentage * 0.15
                : 0;

            int month = DateTime.Now.Month;
            double seasonalBoost = (month >= 6 && month <= 8) ? 5 : 0;
            double variation = -2 + (_random.NextDouble() * 4);

            double temperature = ambient + organicHeat + seasonalBoost + variation;
            return Math.Max(10, Math.Min(60, temperature));
        }

        public double CalculateBatteryDrain(TrashContainer container)
        {
            double baseDrain = 0.002;
            double tempFactor = container.Temperature > 30 ? 1.3 : 1.0;
            return baseDrain * tempFactor;
        }

        public double GetEmptyFillLevel()
        {
            return 2.0 + (_random.NextDouble() * 6.0);
        }
    }
}