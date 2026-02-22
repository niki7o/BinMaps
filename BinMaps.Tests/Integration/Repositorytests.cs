using Xunit;
using FluentAssertions;
using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Tests.Integration
{
    public class RepositoryTests : IDisposable
    {
        #region Fields

        private readonly BinMapsDbContext _context;
        private readonly IRepository<TrashContainer, int> _repository;

        #endregion

        #region Constructor

        public RepositoryTests()
        {
            var options = new DbContextOptionsBuilder<BinMapsDbContext>()
                .UseInMemoryDatabase(databaseName: $"TestDb_{Guid.NewGuid()}")
                .Options;

            _context = new BinMapsDbContext(options);
            _repository = new Repository<TrashContainer, int>(_context);
        }

        #endregion

        #region Add Tests

        [Fact]
        public async Task AddAsync_ValidEntity_AddsToDatabase()
        {
            var container = new TrashContainer
            {
                AreaId = "Зона 1 - Надежда север",
                TrashType = TrashType.Mixed,
                FillPercentage = 50,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };

            await _repository.AddAsync(container);
            _context.ChangeTracker.Clear();

            var retrieved = await _context.TrashContainers.FindAsync(container.Id);
            retrieved.Should().NotBeNull();
            retrieved!.AreaId.Should().Be("Зона 1 - Надежда север");
        }

        [Fact]
        public async Task AddRangeAsync_MultipleEntities_AddsAll()
        {
            var containers = new[]
            {
                new TrashContainer { AreaId = "Zone1", TrashType = TrashType.Mixed, FillPercentage = 50, Capacity = 1100, LocationX = 42.7, LocationY = 23.3, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone2", TrashType = TrashType.Plastic, FillPercentage = 60, Capacity = 1100, LocationX = 42.71, LocationY = 23.31, Status = TrashContainerStatus.Active }
            };

            await _repository.AddRangeAsync(containers);

            var all = await _repository.GetAllAsync();
            all.Should().HaveCount(2);
        }

        #endregion

        #region Get Tests

        [Fact]
        public async Task GetByIdAsync_ExistingEntity_ReturnsEntity()
        {
            var container = new TrashContainer
            {
                AreaId = "Test Zone",
                TrashType = TrashType.Mixed,
                FillPercentage = 75,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };
            await _repository.AddAsync(container);

            var retrieved = await _repository.GetByIdAsync(container.Id);

            retrieved.Should().NotBeNull();
            retrieved!.Id.Should().Be(container.Id);
            retrieved.FillPercentage.Should().Be(75);
        }

        [Fact]
        public async Task GetByIdAsync_NonExistent_ReturnsNull()
        {
            var result = await _repository.GetByIdAsync(999);

            result.Should().BeNull();
        }

        [Fact]
        public async Task GetAllAsync_ReturnsAllEntities()
        {
            var containers = new[]
            {
                new TrashContainer { AreaId = "Zone1", TrashType = TrashType.Mixed, FillPercentage = 50, Capacity = 1100, LocationX = 42.7, LocationY = 23.3, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone2", TrashType = TrashType.Plastic, FillPercentage = 60, Capacity = 1100, LocationX = 42.71, LocationY = 23.31, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone3", TrashType = TrashType.Paper, FillPercentage = 70, Capacity = 1100, LocationX = 42.72, LocationY = 23.32, Status = TrashContainerStatus.Active }
            };
            await _repository.AddRangeAsync(containers);

            var all = await _repository.GetAllAsync();

            all.Should().HaveCount(3);
        }

        [Fact]
        public async Task FirstOrDefaultAsync_WithPredicate_ReturnsMatch()
        {
            var containers = new[]
            {
                new TrashContainer { AreaId = "Zone1", TrashType = TrashType.Mixed, FillPercentage = 50, Capacity = 1100, LocationX = 42.7, LocationY = 23.3, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone2", TrashType = TrashType.Plastic, FillPercentage = 85, Capacity = 1100, LocationX = 42.71, LocationY = 23.31, Status = TrashContainerStatus.Active }
            };
            await _repository.AddRangeAsync(containers);

            var result = await _repository.FirstOrDefaultAsync(c => c.FillPercentage > 80);

            result.Should().NotBeNull();
            result!.FillPercentage.Should().Be(85);
        }

        [Fact]
        public async Task FirstOrDefaultAsync_NoMatch_ReturnsNull()
        {
            var container = new TrashContainer
            {
                AreaId = "Zone1",
                TrashType = TrashType.Mixed,
                FillPercentage = 50,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };
            await _repository.AddAsync(container);

            var result = await _repository.FirstOrDefaultAsync(c => c.FillPercentage > 90);

            result.Should().BeNull();
        }

        #endregion

        #region Update Tests

        [Fact]
        public async Task UpdateAsync_ExistingEntity_UpdatesSuccessfully()
        {
            var container = new TrashContainer
            {
                AreaId = "Zone1",
                TrashType = TrashType.Mixed,
                FillPercentage = 50,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };
            await _repository.AddAsync(container);

            container.FillPercentage = 80;
            var result = await _repository.UpdateAsync(container);

            result.Should().BeTrue();
            var updated = await _repository.GetByIdAsync(container.Id);
            updated!.FillPercentage.Should().Be(80);
        }

        [Fact]
        public async Task UpdateAsync_MultipleProperties_AllUpdated()
        {
            var container = new TrashContainer
            {
                AreaId = "Zone1",
                TrashType = TrashType.Mixed,
                FillPercentage = 50,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active,
                Temperature = 20,
                HasSensor = true
            };
            await _repository.AddAsync(container);

            container.FillPercentage = 90;
            container.Temperature = 35;
            container.Status = TrashContainerStatus.Fire;
            await _repository.UpdateAsync(container);

            var updated = await _repository.GetByIdAsync(container.Id);
            updated!.FillPercentage.Should().Be(90);
            updated.Temperature.Should().Be(35);
            updated.Status.Should().Be(TrashContainerStatus.Fire);
        }

        #endregion

        #region Delete Tests

        [Fact]
        public async Task DeleteAsync_ExistingEntity_RemovesFromDatabase()
        {
            var container = new TrashContainer
            {
                AreaId = "Zone1",
                TrashType = TrashType.Mixed,
                FillPercentage = 50,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };
            await _repository.AddAsync(container);
            var id = container.Id;

            var result = await _repository.DeleteAsync(container);

            result.Should().BeTrue();
            var deleted = await _repository.GetByIdAsync(id);
            deleted.Should().BeNull();
        }

        [Fact]
        public async Task DeleteAsync_ReducesCount()
        {
            var containers = new[]
            {
                new TrashContainer { AreaId = "Zone1", TrashType = TrashType.Mixed, FillPercentage = 50, Capacity = 1100, LocationX = 42.7, LocationY = 23.3, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone2", TrashType = TrashType.Plastic, FillPercentage = 60, Capacity = 1100, LocationX = 42.71, LocationY = 23.31, Status = TrashContainerStatus.Active }
            };
            await _repository.AddRangeAsync(containers);

            await _repository.DeleteAsync(containers[0]);

            var remaining = await _repository.GetAllAsync();
            remaining.Should().HaveCount(1);
        }

        #endregion

        #region GetAllAttached Tests

        [Fact]
        public void GetAllAttached_ReturnsQueryable()
        {
            var queryable = _repository.GetAllAttached();

            queryable.Should().BeAssignableTo<IQueryable<TrashContainer>>();
        }

        [Fact]
        public async Task GetAllAttached_CanBeFiltered()
        {
            var containers = new[]
            {
                new TrashContainer { AreaId = "Zone1", TrashType = TrashType.Mixed, FillPercentage = 50, Capacity = 1100, LocationX = 42.7, LocationY = 23.3, Status = TrashContainerStatus.Active },
                new TrashContainer { AreaId = "Zone2", TrashType = TrashType.Plastic, FillPercentage = 85, Capacity = 1100, LocationX = 42.71, LocationY = 23.31, Status = TrashContainerStatus.Active }
            };
            await _repository.AddRangeAsync(containers);

            var filtered = _repository.GetAllAttached()
                .Where(c => c.FillPercentage > 80)
                .ToList();

            filtered.Should().HaveCount(1);
            filtered[0].FillPercentage.Should().Be(85);
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