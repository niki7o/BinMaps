using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;

namespace BinMaps.Infrastructure.Services
{
    public class FillageSimulator
    {
        private readonly Random _random = new Random();

        
        public double CalculateFillIncrement(TrashContainer container)
        {
            // Base fill rate per update cycle (every 10 seconds)
            // Target: ~1% per hour = 0.0027% per 10 seconds
            double baseIncrement = 0.003; // Very slow!

            // Zone-based multiplier (some zones fill faster)
            double zoneMultiplier = GetZoneMultiplier(container.AreaId);

            // Trash type multiplier
            double typeMultiplier = container.TrashType switch
            {
                TrashType.Mixed => 1.5,      // Mixed fills fastest
                TrashType.Plastic => 1.2,    // Plastic medium-fast
                TrashType.Paper => 1.0,      // Paper normal
                TrashType.Glass => 0.8,      // Glass slowest
                _ => 1.0
            };

            // Time-of-day multiplier (more waste during day)
            double timeMultiplier = GetTimeMultiplier();

            // Random variation (±20%)
            double randomFactor = 0.8 + (_random.NextDouble() * 0.4);

            // Final increment
            double increment = baseIncrement * zoneMultiplier * typeMultiplier * timeMultiplier * randomFactor;

            // Slow down as container gets fuller (harder to compress)
            if (container.FillPercentage > 80)
            {
                increment *= 0.5; // Half speed when nearly full
            }
            else if (container.FillPercentage > 60)
            {
                increment *= 0.7; // Slower when getting full
            }

            return increment;
        }

        private double GetZoneMultiplier(string areaId)
        {
            // City center and busy areas fill faster
            return areaId switch
            {
                "Зона 2 - Център" => 2.0,           // Center - very busy
                "Зона 1 - Надежда север" => 1.5,    // Residential - busy
                "Зона 3 - Люлин" => 1.3,            // Residential
                "Зона 6 - Изток" => 1.2,            // Mixed
                "Зона 4 - Овча Купел" => 1.0,       // Moderate
                "Зона 5 - Юг и Витоша" => 0.8,      // Less dense
                _ => 1.0
            };
        }

        private double GetTimeMultiplier()
        {
            int hour = DateTime.Now.Hour;

            // Peak waste times: 8-10 AM, 12-2 PM, 6-9 PM
            if ((hour >= 8 && hour < 10) || (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21))
            {
                return 1.5; // Peak times
            }
            else if (hour >= 22 || hour < 6)
            {
                return 0.3; // Night - very slow
            }
            else
            {
                return 1.0; // Normal
            }
        }

        /// <summary>
        /// Simulate temperature with realistic ranges
        /// </summary>
        public double SimulateTemperature(TrashContainer container)
        {
            // Base ambient temperature (15-25°C in Sofia)
            double ambient = 15 + (_random.NextDouble() * 10);

            // Organic waste increases temperature
            double organicHeat = container.TrashType == TrashType.Mixed
                ? container.FillPercentage * 0.15  // Up to +15°C for full mixed waste
                : 0;

            // Summer heat boost
            int month = DateTime.Now.Month;
            double seasonalBoost = (month >= 6 && month <= 8) ? 5 : 0;

            // Random variation
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