using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Moq;
using Xunit;

namespace BinMaps.Tests.Unit.Services
{
    public class ReportServiceTests
    {
        private readonly Mock<IRepository<Report, int>> _mockReportRepo;
        private readonly Mock<IAIService> _mockAIService;
        private readonly Mock<UserManager<User>> _mockUserManager;
        private readonly ReportService _service;

        public ReportServiceTests()
        {
            _mockReportRepo = new Mock<IRepository<Report, int>>();
            _mockAIService = new Mock<IAIService>();

            var userStoreMock = new Mock<IUserStore<User>>();
            _mockUserManager = new Mock<UserManager<User>>(
                userStoreMock.Object, null, null, null, null, null, null, null, null);

            _service = new ReportService(
                _mockReportRepo.Object,
                _mockAIService.Object,
                _mockUserManager.Object);
        }

        #region CreateAsync Tests

        [Fact]
        public async Task CreateAsync_WithPhoto_CallsAIService()
        {
            // Arrange
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object,
                Description = "Test"
            };

            var user = new User { Id = "user1", Reputation = 70 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 85 });
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            _mockAIService.Verify(s => s.AnalyzeAsync(mockPhoto.Object), Times.Once);
        }

        [Fact]
        public async Task CreateAsync_WithoutPhoto_SkipsAIService()
        {
            // Arrange
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null,
                Description = "Test"
            };

            var user = new User { Id = "user1", Reputation = 70 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            _mockAIService.Verify(s => s.AnalyzeAsync(It.IsAny<IFormFile>()), Times.Never);
        }

        [Fact]
        public async Task CreateAsync_CalculatesFinalConfidenceCorrectly()
        {
            // Arrange
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            var user = new User { Id = "user1", Reputation = 80 }; // 80% reputation
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            capturedReport.Should().NotBeNull();
            // Without AI: confidence = reputation * 0.4 = 80 * 0.4 = 32
            capturedReport!.FinalConfidence.Should().Be(32);
        }

        [Fact]
        public async Task CreateAsync_WithAI_CalculatesWeightedConfidence()
        {
            // Arrange
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };

            var user = new User { Id = "user1", Reputation = 60 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 90 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            // Confidence = (90 * 0.6) + (60 * 0.4) = 54 + 24 = 78
            capturedReport!.FinalConfidence.Should().Be(78);
        }

        [Fact]
        public async Task CreateAsync_FireReport_AutoApproved()
        {
            // Arrange
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Fire,
                Photo = null
            };

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task CreateAsync_HighConfidence_AutoApproved()
        {
            // Arrange
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };

            var user = new User { Id = "user1", Reputation = 100 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 100 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            // Act
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            // Assert
            // (100 * 0.6) + (100 * 0.4) = 100 >= 80 → auto approved
            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Theory]
        [InlineData("User", ReportType.TruckProblem)]
        [InlineData("User", ReportType.ContainerDamage)]
        public async Task CreateAsync_UnauthorizedReportType_ThrowsException(string role, ReportType reportType)
        {
            // Arrange
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = reportType
            };

            // Act & Assert
            await Assert.ThrowsAsync<UnauthorizedAccessException>(
                () => _service.CreateAsync(dto, "user1", "testuser", role));
        }

        [Theory]
        [InlineData("Driver", ReportType.TruckProblem)]
        [InlineData("Admin", ReportType.ContainerDamage)]
        public async Task CreateAsync_AuthorizedRole_AllowsRestrictedReportTypes(string role, ReportType reportType)
        {
            // Arrange
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = reportType
            };

            var user = new User { Id = "user1", Reputation = 70 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);

            // Act
            var exception = await Record.ExceptionAsync(
                () => _service.CreateAsync(dto, "user1", "testuser", role));

            // Assert
            exception.Should().BeNull();
        }

        #endregion

        #region ApproveAsync Tests

        [Fact]
        public async Task ApproveAsync_ValidReport_SetsApprovedTrue()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.ApproveAsync(1);

            // Assert
            report.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task ApproveAsync_IncreasesUserReputation()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.ApproveAsync(1);

            // Assert
            user.Reputation.Should().Be(60); // 50 + 10
        }

        [Fact]
        public async Task ApproveAsync_ClampsReputationAt100()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 95 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.ApproveAsync(1);

           
            user.Reputation.Should().Be(100); 
        }

        #endregion

        #region RejectAsync Tests

        [Fact]
        public async Task RejectAsync_ValidReport_SetsApprovedFalse()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.RejectAsync(1);

            // Assert
            report.IsApproved.Should().BeFalse();
        }

        [Fact]
        public async Task RejectAsync_DecreasesUserReputation()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.RejectAsync(1);

            // Assert
            user.Reputation.Should().Be(45); // 50 - 5
        }

        [Fact]
        public async Task RejectAsync_ClampsReputationAt0()
        {
            // Arrange
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 3 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            // Act
            await _service.RejectAsync(1);

            // Assert
            user.Reputation.Should().Be(0); // Clamped at 0
        }

        #endregion
    }
}