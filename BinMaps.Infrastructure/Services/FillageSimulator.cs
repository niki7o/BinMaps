using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using System;

namespace BinMaps.Infrastructure.Services
{
    public class FillageSimulator
    {
        private readonly Random _random = new();

        public double CalculateFillIncrement(TrashContainer container)
        {
            var now = DateTime.Now;

            var hourFactor = GetHourFactor(now.Hour);
            var dayFactor = GetDayOfWeekFactor(now.DayOfWeek);
            var areaFactor = GetAreaDensityFactor(container.AreaId);
            var typeFactor = GetWasteTypeFactor(container.TrashType);
            var seasonFactor = GetSeasonalFactor(now.Month);

            var randomness = _random.NextDouble() * 0.5 + 0.75;

            var baseIncrement = 0.15;
            var totalFactor = hourFactor * dayFactor * areaFactor * typeFactor * seasonFactor * randomness;

            var increment = baseIncrement * totalFactor;

            if (container.FillPercentage > 85)
                increment *= 0.3;
            else if (container.FillPercentage > 70)
                increment *= 0.6;

            return increment;
        }

        private double GetHourFactor(int hour)
        {
            return hour switch
            {
                0 or 1 or 2 or 3 or 4 or 5 or 6 => 0.2,
                7 or 8 or 9 => 1.8,
                10 or 11 => 1.4,
                12 => 2.5,
                13 or 14 or 15 or 16 or 17 => 1.6,
                18 or 19 or 20 => 2.0,
                21 or 22 or 23 => 1.2,
                _ => 1.0
            };
        }

        private double GetDayOfWeekFactor(DayOfWeek day)
        {
            return day switch
            {
                DayOfWeek.Monday => 1.0,
                DayOfWeek.Tuesday => 1.2,
                DayOfWeek.Wednesday => 1.3,
                DayOfWeek.Thursday => 1.4,
                DayOfWeek.Friday => 1.8,
                DayOfWeek.Saturday => 1.5,
                DayOfWeek.Sunday => 0.7,
                _ => 1.0
            };
        }

        private double GetAreaDensityFactor(string areaId)
        {
            return areaId switch
            {
                "Зона 2 - Център" => 2.0,
                "Зона 1 - Надежда север" => 1.3,
                "Зона 6 - Изток" => 1.2,
                "Зона 3 - Люлин" => 1.1,
                "Зона 4 - Овча Купел" => 0.9,
                "Зона 5 - Юг и Витоша" => 0.8,
                _ => 1.0
            };
        }

        private double GetWasteTypeFactor(TrashType type)
        {
            return type switch
            {
                TrashType.Mixed => 1.5,
                TrashType.Plastic => 1.3,
                TrashType.Paper => 1.1,
                TrashType.Glass => 0.7,
                _ => 1.0
            };
        }

        private double GetSeasonalFactor(int month)
        {
            return month switch
            {
                12 or 1 or 2 => 0.9,
                3 => 1.0,
                4 => 1.1,
                5 => 1.2,
                6 or 7 or 8 => 1.4,
                9 => 1.2,
                10 => 1.1,
                11 => 1.0,
                _ => 1.0
            };
        }

        public double SimulateTemperature(TrashContainer container)
        {
            var hour = DateTime.Now.Hour;
            var month = DateTime.Now.Month;

            var seasonalBase = month switch
            {
                12 or 1 or 2 => 5,
                3 or 4 or 5 => 15,
                6 or 7 or 8 => 30,
                _ => 18
            };

            var diurnalOffset = hour switch
            {
                >= 4 and <= 6 => -5,
                >= 13 and <= 16 => +10,
                >= 20 or <= 3 => -3,
                _ => 0
            };

            var containerHeat = container.TrashType == TrashType.Mixed
                ? container.FillPercentage * 0.08
                : 0;

            var solarGain = (hour >= 9 && hour <= 17) ? _random.Next(3, 8) : 0;

            return Math.Round(seasonalBase + diurnalOffset + containerHeat + solarGain + _random.Next(-2, 3), 1);
        }

        public double CalculateBatteryDrain(TrashContainer container)
        {
            if (!container.HasSensor)
                return 0;

            var tempStress = Math.Abs((container.Temperature ?? 20) - 20) / 30.0;
            var activityDrain = container.FillPercentage > 80 ? 1.2 : 1.0;

            var drain = 0.08 * (1 + tempStress) * activityDrain;

            return drain;
        }

        public void EmptyContainer(TrashContainer container)
        {
            container.FillPercentage = _random.Next(2, 8);

            if (container.Status == TrashContainerStatus.Fire)
                container.Status = TrashContainerStatus.Active;
        }
    }
}