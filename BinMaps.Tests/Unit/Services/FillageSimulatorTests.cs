using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure;

using FluentAssertions;
using Xunit;

namespace BinMaps.Tests.Unit.Services
{
    public class FillageSimulatorTests
    {
        private readonly FillageSimulator _simulator;

        public FillageSimulatorTests()
        {
            _simulator = new FillageSimulator();
        }

        #region CalculateFillIncrement Tests

        [Fact]
        public void CalculateFillIncrement_MixedTrash_FillsFasterThanOthers()
        {
            var mixedContainer = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 50 };
            var plasticContainer = new TrashContainer { TrashType = TrashType.Plastic, FillPercentage = 50 };

            double mixedTotal = 0, plasticTotal = 0;
            for (int i = 0; i < 200; i++)
            {
                mixedTotal += _simulator.CalculateFillIncrement(mixedContainer, 1.0);
                plasticTotal += _simulator.CalculateFillIncrement(plasticContainer, 1.0);
            }

            mixedTotal.Should().BeGreaterThan(plasticTotal);
        }

        [Fact]
        public void CalculateFillIncrement_CenterZone_FillsFasterThanSuburbs()
        {
            var container = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 50 };

            double centerTotal = 0, suburbTotal = 0;
            for (int i = 0; i < 200; i++)
            {
                centerTotal += _simulator.CalculateFillIncrement(container, 1.2);
                suburbTotal += _simulator.CalculateFillIncrement(container, 0.8);
            }

            centerTotal.Should().BeGreaterThan(suburbTotal);
        }

        [Fact]
        public void CalculateFillIncrement_HighFill_SlowsDown()
        {
            var container50 = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 50 };
            var container90 = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 90 };

            double total50 = 0, total90 = 0;
            for (int i = 0; i < 200; i++)
            {
                total50 += _simulator.CalculateFillIncrement(container50, 1.0);
                total90 += _simulator.CalculateFillIncrement(container90, 1.0);
            }

            total90.Should().BeLessThan(total50);
        }

        [Theory]
        [InlineData(TrashType.Mixed)]
        [InlineData(TrashType.Plastic)]
        [InlineData(TrashType.Paper)]
        [InlineData(TrashType.Glass)]
        public void CalculateFillIncrement_AllTypes_ReturnsPositive(TrashType type)
        {
            var container = new TrashContainer { TrashType = type, FillPercentage = 30 };
            var increment = _simulator.CalculateFillIncrement(container, 1.0);
            increment.Should().BeGreaterThan(0);
        }

        [Fact]
        public void CalculateFillIncrement_AlwaysPositive()
        {
            var container = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 50 };
            for (int i = 0; i < 50; i++)
            {
                _simulator.CalculateFillIncrement(container, 1.0).Should().BeGreaterThan(0);
            }
        }

        #endregion

        #region SimulateTemperature Tests

        [Fact]
        public void SimulateTemperature_MixedTrash_HigherAverageThanNonOrganic()
        {
            var mixed = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 80 };
            var glass = new TrashContainer { TrashType = TrashType.Glass, FillPercentage = 80 };

            double mixedAvg = 0, glassAvg = 0;
            for (int i = 0; i < 200; i++)
            {
                mixedAvg += _simulator.SimulateTemperature(mixed);
                glassAvg += _simulator.SimulateTemperature(glass);
            }

            (mixedAvg / 200).Should().BeGreaterThan(glassAvg / 200);
        }

        [Fact]
        public void SimulateTemperature_FullerContainers_HigherAverageTemp()
        {
            var full = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 90 };
            var empty = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 10 };

            double fullAvg = 0, emptyAvg = 0;
            for (int i = 0; i < 200; i++)
            {
                fullAvg += _simulator.SimulateTemperature(full);
                emptyAvg += _simulator.SimulateTemperature(empty);
            }

            (fullAvg / 200).Should().BeGreaterThan(emptyAvg / 200);
        }

        [Fact]
        public void SimulateTemperature_WithinRealisticRange()
        {
            var container = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 70 };
            for (int i = 0; i < 50; i++)
            {
                _simulator.SimulateTemperature(container).Should().BeInRange(10, 60);
            }
        }

        [Fact]
        public void SimulateTemperature_NeverBelowMinimum()
        {
            var container = new TrashContainer { TrashType = TrashType.Glass, FillPercentage = 5 };
            for (int i = 0; i < 100; i++)
            {
                _simulator.SimulateTemperature(container).Should().BeGreaterThanOrEqualTo(10);
            }
        }

        [Fact]
        public void SimulateTemperature_NeverAboveMaximum()
        {
            var container = new TrashContainer { TrashType = TrashType.Mixed, FillPercentage = 95, Temperature = 50 };
            for (int i = 0; i < 100; i++)
            {
                _simulator.SimulateTemperature(container).Should().BeLessThanOrEqualTo(60);
            }
        }

        #endregion

        #region CalculateBatteryDrain Tests

        [Fact]
        public void CalculateBatteryDrain_HighTemp_DrainsFaster()
        {
            var hot = new TrashContainer { Temperature = 35 };
            var cool = new TrashContainer { Temperature = 20 };

            _simulator.CalculateBatteryDrain(hot).Should().BeGreaterThan(_simulator.CalculateBatteryDrain(cool));
        }

        [Fact]
        public void CalculateBatteryDrain_AlwaysPositive()
        {
            var container = new TrashContainer { Temperature = 25 };
            _simulator.CalculateBatteryDrain(container).Should().BeGreaterThan(0);
        }

        [Fact]
        public void CalculateBatteryDrain_RealisticRate()
        {
            var container = new TrashContainer { Temperature = 25, BatteryPercentage = 100 };
            _simulator.CalculateBatteryDrain(container).Should().BeLessThan(0.1);
        }

        #endregion

        #region GetEmptyFillLevel Tests

        [Fact]
        public void GetEmptyFillLevel_ReturnsResidualLevel()
        {
            _simulator.GetEmptyFillLevel().Should().BeInRange(2, 8);
        }

        [Fact]
        public void GetEmptyFillLevel_NeverZero()
        {
            for (int i = 0; i < 100; i++)
            {
                _simulator.GetEmptyFillLevel().Should().BeGreaterThan(0);
            }
        }

        #endregion

        #region Integration Tests

        [Fact]
        public void Simulation_OverTime_ContainerFillsGradually()
        {
            var container = new TrashContainer
            {
                TrashType = TrashType.Mixed,
                FillPercentage = 0,
                BatteryPercentage = 100
            };

            double previous = 0;
            for (int i = 0; i < 100; i++)
            {
                container.FillPercentage += _simulator.CalculateFillIncrement(container, 1.2);
                container.FillPercentage.Should().BeGreaterThan(previous);
                previous = container.FillPercentage;
            }

            container.FillPercentage.Should().BeGreaterThan(10);
        }

        [Fact]
        public void Simulation_BatteryDepletes_OverTime()
        {
            var container = new TrashContainer { BatteryPercentage = 100, Temperature = 25 };

            for (int i = 0; i < 1000; i++)
            {
                var drain = _simulator.CalculateBatteryDrain(container);
                container.BatteryPercentage = Math.Max(0, container.BatteryPercentage!.Value - drain);
            }

            container.BatteryPercentage.Should().BeLessThan(100);
            container.BatteryPercentage.Should().BeGreaterThan(0);
        }

        #endregion
    }
}
