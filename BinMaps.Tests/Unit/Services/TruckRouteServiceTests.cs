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
        private readonly Mock<IRepository<Truck, int>> _mockTruckRepo;
        private readonly Mock<IRepository<TrashContainer, int>> _mockContainerRepo;
        private readonly TruckRouteService _service;

        public TruckRouteServiceTests()
        {
            _mockTruckRepo = new Mock<IRepository<Truck, int>>();
            _mockContainerRepo = new Mock<IRepository<TrashContainer, int>>();
         
            _service = new TruckRouteService(_mockTruckRepo.Object, _mockContainerRepo.Object);
        }

        #region Test Data Helpers

        private static List<TrashContainer> GetTestContainers() => new()
        {
            new() { Id = 1, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 85.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Active },
            new() { Id = 2, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 65.0, Capacity = 1100, LocationX = 42.7123, LocationY = 23.3056, Status = TrashContainerStatus.Active },
            new() { Id = 3, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 92.0, Capacity = 1100, LocationX = 42.7156, LocationY = 23.3084, Status = TrashContainerStatus.Active }
        };

        private static Truck GetTestTruck() => new()
        {
            Id = 1, AreaId = "Зона 1", TrashType = TrashType.Mixed,
            Capacity = 10000, LocationX = 42.7100, LocationY = 23.3000
        };

        private void SetupMocks(List<Truck> trucks, List<TrashContainer> containers)
        {
            _mockTruckRepo.Setup(r => r.GetAllAttached())
                .Returns(new TestAsyncEnumerable<Truck>(trucks));
            _mockContainerRepo.Setup(r => r.GetAllAttached())
                .Returns(new TestAsyncEnumerable<TrashContainer>(containers));
        }

        #endregion

        #region Happy Path Tests

        [Fact]
        public async Task GenerateRoute_ValidInput_ReturnsOptimizedRoute()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.Should().NotBeNull();
            result.Route.Should().NotBeEmpty();
            result.TotalDistance.Should().BeGreaterThan(0);
            result.TotalLoad.Should().BeGreaterThan(0);
            result.ContainersCount.Should().Be(3);
        }

        [Fact]
        public async Task GenerateRoute_PrioritizesCriticalContainers()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.Route.Should().Contain(c => c.Id == 3);
        }

        [Fact]
        public async Task GenerateRoute_RespectsCapacityLimit()
        {
            var smallTruck = new Truck { Id = 1, AreaId = "Зона 1", TrashType = TrashType.Mixed, Capacity = 1500, LocationX = 42.71, LocationY = 23.30 };
            SetupMocks(new List<Truck> { smallTruck }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.TotalLoad.Should().BeLessThanOrEqualTo(smallTruck.Capacity);
        }

        [Fact]
        public async Task GenerateRoute_CalculatesEstimatedTime()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.EstimatedTimeMinutes.Should().BeGreaterThan(0);
            // At 5 min/stop minimum
            result.EstimatedTimeMinutes.Should().BeGreaterThan(result.ContainersCount * 5);
        }

        #endregion

        #region Edge Cases

        [Fact]
        public async Task GenerateRoute_NoTruck_ThrowsInvalidOperation()
        {
            SetupMocks(new List<Truck>(), GetTestContainers());

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => _service.GenerateRouteAsync("Зона 1", TrashType.Mixed));
        }

        [Fact]
        public async Task GenerateRoute_NoContainers_ReturnsEmptyRoute()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, new List<TrashContainer>());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.Route.Should().BeEmpty();
            result.Message.Should().Contain("Няма");
        }

        [Fact]
        public async Task GenerateRoute_LowFillContainers_ReturnsEmptyRoute()
        {
            var lowFillContainers = new List<TrashContainer>
            {
                new() { Id = 1, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 20.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Active }
            };
            SetupMocks(new List<Truck> { GetTestTruck() }, lowFillContainers);

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.Route.Should().BeEmpty();
        }

        [Fact]
        public async Task GenerateRoute_FireContainers_AreExcluded()
        {
            var containers = new List<TrashContainer>
            {
                new() { Id = 1, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 85.0, Capacity = 1100, LocationX = 42.7089, LocationY = 23.3028, Status = TrashContainerStatus.Fire },
                new() { Id = 2, AreaId = "Зона 1", TrashType = TrashType.Mixed, FillPercentage = 65.0, Capacity = 1100, LocationX = 42.7123, LocationY = 23.3056, Status = TrashContainerStatus.Active }
            };
            SetupMocks(new List<Truck> { GetTestTruck() }, containers);

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            result.Route.Should().NotContain(c => c.Id == 1);
            result.Route.Should().Contain(c => c.Id == 2);
        }

        #endregion

        #region Algorithm Tests

        [Fact]
        public async Task GenerateRoute_SequentialStopNumbers()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            for (int i = 0; i < result.Route.Count; i++)
            {
                result.Route[i].StopNumber.Should().Be(i + 1);
            }
        }

        [Fact]
        public async Task GenerateRoute_TotalLoadMatchesStopsSum()
        {
            SetupMocks(new List<Truck> { GetTestTruck() }, GetTestContainers());

            var result = await _service.GenerateRouteAsync("Зона 1", TrashType.Mixed);

            var sumOfStops = result.Route.Sum(c => c.EstimatedLoad);
            result.TotalLoad.Should().BeApproximately(sumOfStops, 0.5);
        }

        #endregion
    }
}
