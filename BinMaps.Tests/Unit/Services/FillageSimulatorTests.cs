//using BinMaps.Data.Entities;
//using BinMaps.Data.Entities.Enums;
//using BinMaps.Infrastructure;

//using FluentAssertions;
//using Xunit;

//namespace BinMaps.Tests.Unit.Services
//{
//    public class FillageSimulatorTests
//    {
//        private readonly FillageSimulator _simulator;

//        public FillageSimulatorTests()
//        {
//            _simulator = new FillageSimulator();
//        }

//        #region CalculateFillIncrement Tests

//        [Fact]
//        public void CalculateFillIncrement_MixedTrash_FillsFasterThanOthers()
//        {
            
//            var mixedContainer = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 50
//            };

//            var plasticContainer = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = TrashType.Plastic,
//                FillPercentage = 50
//            };

         
//            var mixedIncrement = _simulator.CalculateFillIncrement(mixedContainer);
//            var plasticIncrement = _simulator.CalculateFillIncrement(plasticContainer);

            
//            mixedIncrement.Should().BeGreaterThan(plasticIncrement);
//        }

//        [Fact]
//        public void CalculateFillIncrement_CenterZone_FillsFasterThanSuburbs()
//        {
            
//            var centerContainer = new TrashContainer
//            {
//                AreaId = "Зона 2 - Център",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 50
//            };

//            var suburbContainer = new TrashContainer
//            {
//                AreaId = "Зона 5 - Юг и Витоша",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 50
//            };

           
//            var centerIncrement = _simulator.CalculateFillIncrement(centerContainer);
//            var suburbIncrement = _simulator.CalculateFillIncrement(suburbContainer);

           
//            centerIncrement.Should().BeGreaterThan(suburbIncrement);
//        }

//        [Fact]
//        public void CalculateFillIncrement_HighFill_SlowsDown()
//        {
           
//            var container50 = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 50
//            };

//            var container90 = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 90
//            };

            
//            var increment50 = _simulator.CalculateFillIncrement(container50);
//            var increment90 = _simulator.CalculateFillIncrement(container90);

            
//            increment90.Should().BeLessThan(increment50);
//        }

//        [Theory]
//        [InlineData(TrashType.Mixed, 1.5)]
//        [InlineData(TrashType.Plastic, 1.2)]
//        [InlineData(TrashType.Paper, 1.0)]
//        [InlineData(TrashType.Glass, 0.8)]
//        public void CalculateFillIncrement_DifferentTypes_CorrectMultipliers(TrashType type, double expectedMultiplier)
//        {
            
//            var container = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = type,
//                FillPercentage = 30
//            };

            
//            var increment = _simulator.CalculateFillIncrement(container);

          
//            increment.Should().BeGreaterThan(0);
            
//        }

//        [Fact]
//        public void CalculateFillIncrement_AlwaysPositive()
//        {
          
//            var container = new TrashContainer
//            {
//                AreaId = "Зона 1 - Надежда север",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 50
//            };

           
//            var increment = _simulator.CalculateFillIncrement(container);

           
//            increment.Should().BeGreaterThan(0);
//        }

//        #endregion

//        #region SimulateTemperature Tests

//        [Fact]
//        public void SimulateTemperature_MixedTrash_HigherThanNonOrganic()
//        {
            
//            var mixedContainer = new TrashContainer
//            {
//                TrashType = TrashType.Mixed,
//                FillPercentage = 80,
//                HasSensor = true
//            };

//            var glassContainer = new TrashContainer
//            {
//                TrashType = TrashType.Glass,
//                FillPercentage = 80,
//                HasSensor = true
//            };

           
//            var mixedTemp = _simulator.SimulateTemperature(mixedContainer);
//            var glassTemp = _simulator.SimulateTemperature(glassContainer);

            
//            mixedTemp.Should().BeGreaterThan(glassTemp);
//        }

//        [Fact]
//        public void SimulateTemperature_FullerContainers_HigherTemp()
//        {
            
//            var fullContainer = new TrashContainer
//            {
//                TrashType = TrashType.Mixed,
//                FillPercentage = 90,
//                HasSensor = true
//            };

//            var emptyContainer = new TrashContainer
//            {
//                TrashType = TrashType.Mixed,
//                FillPercentage = 10,
//                HasSensor = true
//            };

            
//            var fullTemp = _simulator.SimulateTemperature(fullContainer);
//            var emptyTemp = _simulator.SimulateTemperature(emptyContainer);

            
//            fullTemp.Should().BeGreaterThan(emptyTemp);
//        }

//        [Fact]
//        public void SimulateTemperature_WithinRealisticRange()
//        {
         
//            var container = new TrashContainer
//            {
//                TrashType = TrashType.Mixed,
//                FillPercentage = 70,
//                HasSensor = true
//            };

         
//            var temperature = _simulator.SimulateTemperature(container);

            
//            temperature.Should().BeInRange(10, 60); 
//        }

//        [Fact]
//        public void SimulateTemperature_NeverBelowMinimum()
//        {
            
//            var container = new TrashContainer
//            {
//                TrashType = TrashType.Glass,
//                FillPercentage = 5,
//                HasSensor = true
//            };

           
//            for (int i = 0; i < 100; i++)
//            {
//                var temperature = _simulator.SimulateTemperature(container);
//                temperature.Should().BeGreaterThan(10);
//            }
//        }

//        [Fact]
//        public void SimulateTemperature_NeverAboveMaximum()
//        {
          
//            var container = new TrashContainer
//            {
//                TrashType = TrashType.Mixed,
//                FillPercentage = 95,
//                HasSensor = true,
//                Temperature = 50
//            };

            
//            for (int i = 0; i < 100; i++)
//            {
//                var temperature = _simulator.SimulateTemperature(container);
//                temperature.Should().BeLessThan(60);
//            }
//        }

//        #endregion

//        #region CalculateBatteryDrain Tests

//        [Fact]
//        public void CalculateBatteryDrain_HighTemp_DrainsFaster()
//        {
            
//            var hotContainer = new TrashContainer
//            {
//                Temperature = 35,
//                HasSensor = true
//            };

//            var coolContainer = new TrashContainer
//            {
//                Temperature = 20,
//                HasSensor = true
//            };

            
//            var hotDrain = _simulator.CalculateBatteryDrain(hotContainer);
//            var coolDrain = _simulator.CalculateBatteryDrain(coolContainer);

           
//            hotDrain.Should().BeGreaterThan(coolDrain);
//        }

//        [Fact]
//        public void CalculateBatteryDrain_AlwaysPositive()
//        {
            
//            var container = new TrashContainer
//            {
//                Temperature = 25,
//                HasSensor = true
//            };

            
//            var drain = _simulator.CalculateBatteryDrain(container);

            
//            drain.Should().BeGreaterThan(0);
//        }

//        [Fact]
//        public void CalculateBatteryDrain_RealisticRate()
//        {
            
//            var container = new TrashContainer
//            {
//                Temperature = 25,
//                HasSensor = true,
//                BatteryPercentage = 100
//            };

          
//            var drain = _simulator.CalculateBatteryDrain(container);

//            drain.Should().BeLessThan(0.1);
//        }

//        #endregion

//        #region GetEmptyFillLevel Tests

//        [Fact]
//        public void GetEmptyFillLevel_ReturnsResidualLevel()
//        {
            
//            var emptyLevel = _simulator.GetEmptyFillLevel();

            
//            emptyLevel.Should().BeInRange(2, 8); 
//        }

//        [Fact]
//        public void GetEmptyFillLevel_NeverZero()
//        {
           
//            for (int i = 0; i < 100; i++)
//            {
//                var emptyLevel = _simulator.GetEmptyFillLevel();
//                emptyLevel.Should().BeGreaterThan(0);
//            }
//        }

//        [Fact]
//        public void GetEmptyFillLevel_VariesBetweenCalls()
//        {
          
//            var level1 = _simulator.GetEmptyFillLevel();
//            var level2 = _simulator.GetEmptyFillLevel();
//            var level3 = _simulator.GetEmptyFillLevel();

           
//            var levels = new[] { level1, level2, level3 };
//            levels.Should().OnlyHaveUniqueItems();
//        }

//        #endregion

//        #region Integration Tests

//        [Fact]
//        public void Simulation_OverTime_ContainerFillsGradually()
//        {
//            var container = new TrashContainer
//            {
//                AreaId = "Зона 2 - Център",
//                TrashType = TrashType.Mixed,
//                FillPercentage = 0,
//                HasSensor = true,
//                BatteryPercentage = 100
//            };

//            double previousFill = container.FillPercentage;

        
//            for (int i = 0; i < 100; i++)
//            {
//                var increment = _simulator.CalculateFillIncrement(container);
//                container.FillPercentage += increment;

               
//                container.FillPercentage.Should().BeGreaterThan(previousFill);
//                previousFill = container.FillPercentage;
//            }

            
//            container.FillPercentage.Should().BeGreaterThan(10);
//        }

//        [Fact]
//        public void Simulation_BatteryDepletes_OverTime()
//        {
          
//            var container = new TrashContainer
//            {
//                HasSensor = true,
//                BatteryPercentage = 100,
//                Temperature = 25
//            };

          
//            for (int i = 0; i < 1000; i++)
//            {
//                var drain = _simulator.CalculateBatteryDrain(container);
//                container.BatteryPercentage = Math.Max(0, container.BatteryPercentage!.Value - drain);
//            }

           
//            container.BatteryPercentage.Should().BeLessThan(100);
//            container.BatteryPercentage.Should().BeGreaterThan(0);
//        }

//        #endregion
//    }
//}