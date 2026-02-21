using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using FluentAssertions;
using Moq;

using Xunit;


namespace BinMaps.Tests.Unit.Services
{
    public class TruckRouteServiceTests
    {
        private readonly Mock<IRepository<TrashContainer, int>> _mockContainerRepo;
        private readonly Mock<IRepository<Truck, int>> _mockTruckRepo;
        private readonly TruckRouteService _service;

        public TruckRouteServiceTests()
        {
            _mockContainerRepo = new Mock<IRepository<TrashContainer, int>>();
            _mockTruckRepo = new Mock<IRepository<Truck, int>>();
            _service = new TruckRouteService(_mockContainerRepo.Object, _mockTruckRepo.Object);
        }

        #region Test Data Helpers

        private List<TrashContainer> GetTestContainers()
        {
            return new List<TrashContainer>
            {
                new() { Id = 1, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 85.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Active, HasSensor = true },
                new() { Id = 2, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 65.0, Capacity = 1100, LocationX = 42.7123, LocationY = 23.3056, Status = TrashContainerStatus.Active, HasSensor = true },
                new() { Id = 3, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 92.0, Capacity = 1100, LocationX = 42.7156, LocationY = 23.3084, Status = TrashContainerStatus.Active, HasSensor = true }
            };
        }

        private Truck GetTestTruck() => new() { Id = 1, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, Capacity = 10000, LocationX = 42.7100, LocationY = 23.3000 };

        #endregion

        #region Happy Path Tests

        [Fact]
        public async Task GenerateRoute_ValidInput_ReturnsOptimizedRoute()
        {
            // Arrange
            var containers = GetTestContainers();
            var truck = GetTestTruck();
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { truck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.Should().NotBeNull();
            result.Route.Should().NotBeEmpty();
            result.TotalDistance.Should().BeGreaterThan(0);
            result.TotalLoad.Should().BeGreaterThan(0);
            result.ContainersCount.Should().Be(3);
        }

        [Fact]
        public async Task GenerateRoute_PrioritizesCriticalContainers()
        {
            // Arrange
            var containers = GetTestContainers();
            var truck = GetTestTruck();
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { truck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert - Container with 92% fill should be included
            result.Route.Should().Contain(c => c.Id == 3);
        }

        [Fact]
        public async Task GenerateRoute_RespectsCapacityLimit()
        {
            // Arrange
            var containers = GetTestContainers();
            var smallTruck = new Truck { Id = 1, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, Capacity = 1500, LocationX = 42.7100, LocationY = 23.3000 };
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { smallTruck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.TotalLoad.Should().BeLessThan(smallTruck.Capacity);
            result.CapacityUtilization.Should().BeLessThan(100);
        }

        [Fact]
        public async Task GenerateRoute_CalculatesEstimatedTime()
        {
            // Arrange
            var containers = GetTestContainers();
            var truck = GetTestTruck();
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { truck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.EstimatedTimeMinutes.Should().BeGreaterThan(0);
            result.EstimatedTimeMinutes.Should().BeGreaterThan(result.ContainersCount * 5); // 5 min per stop
        }

        #endregion

        #region Edge Cases

        [Fact]
        public async Task GenerateRoute_NoTruck_ReturnsEmptyRoute()
        {
            // Arrange
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(GetTestContainers());
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck>());

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.Route.Should().BeEmpty();
            result.Message.Should().Contain("Няма наличен камион");
        }

        [Fact]
        public async Task GenerateRoute_NoContainers_ReturnsEmptyRoute()
        {
            // Arrange
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<TrashContainer>());
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { GetTestTruck() });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.Route.Should().BeEmpty();
            result.Message.Should().Contain("Няма контейнери");
        }

        [Fact]
        public async Task GenerateRoute_LowFillContainers_ReturnsEmptyRoute()
        {
            // Arrange
            var lowFillContainers = new List<TrashContainer>
            {
                new() { Id = 1, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 20.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Active }
            };
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(lowFillContainers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { GetTestTruck() });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.Route.Should().BeEmpty();
        }

        [Fact]
        public async Task GenerateRoute_FireContainers_AreExcluded()
        {
            // Arrange
            var containers = new List<TrashContainer>
            {
                new() { Id = 1, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 85.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Fire },
                new() { Id = 2, AreaId = "Зона 1 - Надежда север", TrashType = TrashType.Mixed, FillPercentage = 65.0, Capacity = 1100, LocationX = 42.7123, LocationY = 23.3056, Status = TrashContainerStatus.Active }
            };
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { GetTestTruck() });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            result.Route.Should().NotContain(c => c.Id == 1);
            result.Route.Should().Contain(c => c.Id == 2);
        }

        #endregion

        #region Algorithm Tests

        [Fact]
        public async Task GenerateRoute_SequentialStopNumbers()
        {
            // Arrange
            var containers = GetTestContainers();
            var truck = GetTestTruck();
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { truck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            for (int i = 0; i < result.Route.Count; i++)
            {
                result.Route[i].StopNumber.Should().Be(i + 1);
            }
        }

        [Fact]
        public async Task GenerateRoute_CalculatesLoadCorrectly()
        {
            // Arrange
            var containers = GetTestContainers();
            var truck = GetTestTruck();
            _mockContainerRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(containers);
            _mockTruckRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Truck> { truck });

            // Act
            var result = await _service.GenerateRouteAsync("Зона 1 - Надежда север", TrashType.Mixed);

            // Assert
            double expectedLoad = result.Route.Sum(c => (c.FillPercentage / 100.0) * c.Capacity);
            result.TotalLoad.Should().BeApproximately(expectedLoad, 0.1);
        }

        #endregion
    }
}