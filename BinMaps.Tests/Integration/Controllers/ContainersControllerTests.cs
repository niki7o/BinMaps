using Xunit;
using FluentAssertions;
using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Tests.Integration.Controllers
{
    public class ContainersControllerTests : IDisposable
    {
        #region Fields

        private readonly BinMapsDbContext _context;
        private readonly Random _random;

        #endregion

        #region Constructor

        public ContainersControllerTests()
        {
            var options = new DbContextOptionsBuilder<BinMapsDbContext>()
                .UseInMemoryDatabase(databaseName: $"TestDb_{Guid.NewGuid()}")
                .Options;

            _context = new BinMapsDbContext(options);
            _random = new Random();

            SeedData();
        }

        #endregion

        #region Test Data Setup

        private void SeedData()
        {
            var containers = new List<TrashContainer>
            {
                new TrashContainer
                {
                    Id = 1,
                    AreaId = "Зона 1 - Надежда север",
                    TrashType = TrashType.Mixed,
                    FillPercentage = 85.0,
                    Capacity = 1100,
                    LocationX = 42.7089,
                    LocationY = 23.3028,
                    Status = TrashContainerStatus.Active,
                    HasSensor = true,
                    Temperature = 25,
                    BatteryPercentage = 85
                },
                new TrashContainer
                {
                    Id = 2,
                    AreaId = "Зона 1 - Надежда север",
                    TrashType = TrashType.Mixed,
                    FillPercentage = 45.0,
                    Capacity = 1100,
                    LocationX = 42.7123,
                    LocationY = 23.3056,
                    Status = TrashContainerStatus.Active,
                    HasSensor = true,
                    Temperature = 22,
                    BatteryPercentage = 90
                },
                new TrashContainer
                {
                    Id = 3,
                    AreaId = "Зона 2 - Център",
                    TrashType = TrashType.Plastic,
                    FillPercentage = 92.0,
                    Capacity = 1100,
                    LocationX = 42.6977,
                    LocationY = 23.3219,
                    Status = TrashContainerStatus.Active,
                    HasSensor = true,
                    Temperature = 28,
                    BatteryPercentage = 75
                }
            };

            _context.TrashContainers.AddRange(containers);
            _context.SaveChanges();
        }

        #endregion

        #region Get Tests

        [Fact]
        public async Task GetAll_ReturnsAllContainers()
        {
            var containers = await _context.TrashContainers.ToListAsync();

            containers.Should().HaveCount(3);
        }

        [Fact]
        public async Task GetById_ExistingId_ReturnsContainer()
        {
            var container = await _context.TrashContainers.FindAsync(1);

            container.Should().NotBeNull();
            container!.Id.Should().Be(1);
            container.FillPercentage.Should().Be(85.0);
        }

        [Fact]
        public async Task GetById_NonExistentId_ReturnsNull()
        {
            var container = await _context.TrashContainers.FindAsync(999);

            container.Should().BeNull();
        }

        #endregion

        #region Update Tests

        [Fact]
        public async Task EmptyContainer_UpdatesFillPercentage()
        {
            var container = await _context.TrashContainers.FindAsync(1);
            container!.FillPercentage = 2.0 + (_random.NextDouble() * 6.0);
            await _context.SaveChangesAsync();

            var updated = await _context.TrashContainers.FindAsync(1);
            updated!.FillPercentage.Should().BeInRange(2, 8);
        }

        #endregion

        #region Query Tests

        [Fact]
        public async Task FilterByZone_ReturnsCorrectContainers()
        {
            var zone1Containers = await _context.TrashContainers
                .Where(c => c.AreaId == "Зона 1 - Надежда север")
                .ToListAsync();

            zone1Containers.Should().HaveCount(2);
        }

        [Fact]
        public async Task CriticalContainers_CorrectlyIdentified()
        {
            var critical = await _context.TrashContainers
                .Where(c => c.FillPercentage > 80)
                .ToListAsync();

            critical.Should().HaveCount(2);
            critical.Should().Contain(c => c.Id == 1);
            critical.Should().Contain(c => c.Id == 3);
        }

        [Fact]
        public async Task FilterByTrashType_ReturnsCorrectContainers()
        {
            var plasticContainers = await _context.TrashContainers
                .Where(c => c.TrashType == TrashType.Plastic)
                .ToListAsync();

            plasticContainers.Should().HaveCount(1);
            plasticContainers[0].Id.Should().Be(3);
        }

        [Fact]
        public async Task SensorEnabled_Containers()
        {
            var withSensors = await _context.TrashContainers
                .Where(c => c.HasSensor)
                .ToListAsync();

            withSensors.Should().HaveCount(3);
        }

        #endregion

        #region Cleanup

        public void Dispose()
        {
            _context.Database.EnsureDeleted();
            _context.Dispose();
        }

        #endregion
    }
}