using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

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
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            _context = new BinMapsDbContext(options);
            _repository = new Repository<TrashContainer, int>(_context);
        }

        #endregion

        #region Add Tests

        [Fact]
        public async Task AddAsync_ValidEntity_AddsToDatabase()
        {
            var container = CreateContainer("Зона 1 - Надежда север", TrashType.Mixed, 50);

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
                CreateContainer("Zone1", TrashType.Mixed, 50),
                CreateContainer("Zone2", TrashType.Plastic, 60)
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
            var container = CreateContainer("Test Zone", TrashType.Mixed, 75);
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
                CreateContainer("Zone1", TrashType.Mixed, 50),
                CreateContainer("Zone2", TrashType.Plastic, 60),
                CreateContainer("Zone3", TrashType.Paper, 70)
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
                CreateContainer("Zone1", TrashType.Mixed, 50),
                CreateContainer("Zone2", TrashType.Plastic, 85)
            };
            await _repository.AddRangeAsync(containers);

            var result = await _repository.FirstOrDefaultAsync(c => c.FillPercentage > 80);

            result.Should().NotBeNull();
            result!.FillPercentage.Should().Be(85);
        }

        [Fact]
        public async Task FirstOrDefaultAsync_NoMatch_ReturnsNull()
        {
            await _repository.AddAsync(CreateContainer("Zone1", TrashType.Mixed, 50));

            var result = await _repository.FirstOrDefaultAsync(c => c.FillPercentage > 90);
            result.Should().BeNull();
        }

        #endregion

        #region Update Tests

        [Fact]
        public async Task UpdateAsync_ExistingEntity_UpdatesSuccessfully()
        {
            var container = CreateContainer("Zone1", TrashType.Mixed, 50);
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
            var container = CreateContainer("Zone1", TrashType.Mixed, 50);
            container.Temperature = 20;
            container.HasSensor = true;
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
            var container = CreateContainer("Zone1", TrashType.Mixed, 50);
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
                CreateContainer("Zone1", TrashType.Mixed, 50),
                CreateContainer("Zone2", TrashType.Plastic, 60)
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
                CreateContainer("Zone1", TrashType.Mixed, 50),
                CreateContainer("Zone2", TrashType.Plastic, 85)
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
            _context.Dispose();
        }

        #endregion

        #region Helpers

        private static int _idSeed = 1;

        private static TrashContainer CreateContainer(string areaId, TrashType type, double fill) =>
            new TrashContainer
            {
                Id = _idSeed++,
                AreaId = areaId,
                TrashType = type,
                FillPercentage = fill,
                Capacity = 1100,
                LocationX = 42.7,
                LocationY = 23.3,
                Status = TrashContainerStatus.Active
            };

        #endregion
    }
}