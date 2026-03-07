using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace BinMaps.Tests.Unit.Services
{
    public class ReportServiceTests
    {
        private readonly Mock<IRepository<Report, int>> _mockReportRepo;
        private readonly Mock<IAIService> _mockAIService;
        private readonly Mock<IReputationService> _mockReputationService;
        private readonly Mock<IContainerUpdateService> _mockContainerUpdateService;
        private readonly Mock<UserManager<User>> _mockUserManager;
        private readonly Mock<IHubContext<ContainerHub>> _mockHub;
        private readonly ReportService _service;

        public ReportServiceTests()
        {
            _mockReportRepo = new Mock<IRepository<Report, int>>();
            _mockAIService = new Mock<IAIService>();
            _mockReputationService = new Mock<IReputationService>();
            _mockContainerUpdateService = new Mock<IContainerUpdateService>();

            _mockUserManager = new Mock<UserManager<User>>(
                Mock.Of<IUserStore<User>>(),
                Mock.Of<IOptions<IdentityOptions>>(),
                Mock.Of<IPasswordHasher<User>>(),
                new IUserValidator<User>[0],
                new IPasswordValidator<User>[0],
                Mock.Of<ILookupNormalizer>(),
                Mock.Of<IdentityErrorDescriber>(),
                Mock.Of<IServiceProvider>(),
                Mock.Of<ILogger<UserManager<User>>>());

            var mockClientProxy = new Mock<IClientProxy>();
            mockClientProxy
                .Setup(c => c.SendCoreAsync(It.IsAny<string>(), It.IsAny<object[]>(), default))
                .Returns(Task.CompletedTask);
            var mockClients = new Mock<IHubClients>();
            mockClients.Setup(c => c.All).Returns(mockClientProxy.Object);

            _mockHub = new Mock<IHubContext<ContainerHub>>();
            _mockHub.Setup(h => h.Clients).Returns(mockClients.Object);

            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Returns(Task.CompletedTask);
            _mockReportRepo
                .Setup(r => r.UpdateAsync(It.IsAny<Report>()))
                .ReturnsAsync(true);
            _mockReputationService
                .Setup(r => r.IncrementAsync(It.IsAny<string>(), It.IsAny<int>()))
                .Returns(Task.CompletedTask);
            _mockReputationService
                .Setup(r => r.DecrementAsync(It.IsAny<string>(), It.IsAny<int>()))
                .Returns(Task.CompletedTask);
            _mockContainerUpdateService
                .Setup(s => s.ApplyReportEffectAsync(It.IsAny<int>(), It.IsAny<ReportType>()))
                .Returns(Task.CompletedTask);

            _mockUserManager
                .Setup(m => m.FindByIdAsync(It.IsAny<string>()))
                .ReturnsAsync((User?)null);
            _mockUserManager
                .Setup(m => m.IsInRoleAsync(It.IsAny<User>(), It.IsAny<string>()))
                .ReturnsAsync(false);

            _service = new ReportService(
                _mockReportRepo.Object,
                _mockAIService.Object,
                _mockReputationService.Object,
                _mockContainerUpdateService.Object,
                _mockUserManager.Object,
                _mockHub.Object);
        }

        #region CreateAsync Tests

        [Fact]
        public async Task CreateAsync_WithPhotoFullReport_CallsAIService()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object,
                Description = "Test"
            };

            _mockAIService
                .Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 85, ContainerDetected = true });

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            _mockAIService.Verify(s => s.AnalyzeAsync(mockPhoto.Object), Times.Once);
        }

        [Fact]
        public async Task CreateAsync_WithPhotoButPrecomputed_SkipsAIService()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };
            var precomputed = new AIResultDto { Confidence = 90, ContainerDetected = true };

            await _service.CreateAsync(dto, "user1", "testuser", "User", precomputed);

            _mockAIService.Verify(s => s.AnalyzeAsync(It.IsAny<IFormFile>()), Times.Never);
        }

        [Fact]
        public async Task CreateAsync_WithoutPhoto_SkipsAIService()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            _mockAIService.Verify(s => s.AnalyzeAsync(It.IsAny<IFormFile>()), Times.Never);
        }

        [Fact]
        public async Task CreateAsync_NoPhoto_UserRole_CalculatesReputationBasedConfidence()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport.Should().NotBeNull();
            // No AI, no photo: CalculateConfidence = reputation * 0.4 = 50 * 0.4 = 20
            capturedReport!.FinalConfidence.Should().Be(20.0);
        }

        [Fact]
        public async Task CreateAsync_WithAIAndPhoto_CalculatesWeightedConfidence()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };

            _mockAIService
                .Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 90, ContainerDetected = true });

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // (90 * 0.6) + (50 * 0.4) = 54 + 20 = 74
            capturedReport!.FinalConfidence.Should().Be(74.0);
        }

        [Fact]
        public async Task CreateAsync_AdminRole_AlwaysAutoApproves()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "admin1", "adminuser", "Admin");

            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task CreateAsync_LowConfidence_NotAutoApproved()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // finalConfidence = 20 < 85 threshold
            capturedReport!.IsApproved.Should().BeNull();
        }

        [Fact]
        public async Task CreateAsync_NoBinDetected_NotAutoApproved()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };
            var precomputed = new AIResultDto
            {
                Confidence = 95,
                ContainerDetected = false,
                DetectedClass = "person"
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User", precomputed);

            // photoPresentButNoBin = true => autoApprove = false
            capturedReport!.IsApproved.Should().BeNull();
        }

        [Fact]
        public async Task CreateAsync_NoBinDetected_MessageIndicatesModerationNeeded()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };
            var precomputed = new AIResultDto { Confidence = 50, ContainerDetected = false };

            var result = await _service.CreateAsync(dto, "user1", "testuser", "User", precomputed);

            result.Message.Should().Contain("модерация");
        }

        [Fact]
        public async Task CreateAsync_SensorBrokenWithoutPhoto_AutoApproved()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.SensorBroken,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task CreateAsync_DriverRole_RecordsZeroReputation()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo
                .Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "driver1", "driveruser", "Driver");

            capturedReport!.UserReputationOnSubmit.Should().Be(0);
        }

        [Fact]
        public async Task CreateAsync_NoPhoto_ReturnsContainerDetectedTrue()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            var result = await _service.CreateAsync(dto, "user1", "testuser", "User");

            // No photo => aiResult is null => containerDetected defaults to true
            result.ContainerDetected.Should().BeTrue();
        }

        #endregion

        #region ApproveAsync Tests

        [Fact]
        public async Task ApproveAsync_ValidReport_SetsApprovedTrue()
        {
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = null };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);

            await _service.ApproveAsync(1);

            report.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task ApproveAsync_CallsUpdateOnRepository()
        {
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = null };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);

            await _service.ApproveAsync(1);

            _mockReportRepo.Verify(r => r.UpdateAsync(report), Times.Once);
        }

        [Fact]
        public async Task ApproveAsync_NonDriver_CallsIncrementReputation()
        {
            var user = new User { Id = "user1" };
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = null };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.IsInRoleAsync(user, "Driver")).ReturnsAsync(false);

            await _service.ApproveAsync(1);

            _mockReputationService.Verify(r => r.IncrementAsync("user1", It.IsAny<int>()), Times.Once);
        }

        [Fact]
        public async Task ApproveAsync_NonExistentReport_ThrowsInvalidOperation()
        {
            _mockReportRepo.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((Report?)null);

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => _service.ApproveAsync(999));
        }

        #endregion

        #region RejectAsync Tests

        [Fact]
        public async Task RejectAsync_ValidReport_SetsApprovedFalse()
        {
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = true };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);

            await _service.RejectAsync(1);

            report.IsApproved.Should().BeFalse();
        }

        [Fact]
        public async Task RejectAsync_CallsUpdateOnRepository()
        {
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = true };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);

            await _service.RejectAsync(1);

            _mockReportRepo.Verify(r => r.UpdateAsync(report), Times.Once);
        }

        [Fact]
        public async Task RejectAsync_NonDriver_CallsDecrementReputation()
        {
            var user = new User { Id = "user1" };
            var report = new Report { Id = 1, UserId = "user1", UserName = "testuser", IsApproved = true };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.IsInRoleAsync(user, "Driver")).ReturnsAsync(false);

            await _service.RejectAsync(1);

            _mockReputationService.Verify(r => r.DecrementAsync("user1", It.IsAny<int>()), Times.Once);
        }

        [Fact]
        public async Task RejectAsync_NonExistentReport_ThrowsInvalidOperation()
        {
            _mockReportRepo.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((Report?)null);

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => _service.RejectAsync(999));
        }

        #endregion
    }
}