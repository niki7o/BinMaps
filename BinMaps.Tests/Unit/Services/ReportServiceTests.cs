using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using FluentAssertions;
using Moq;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace BinMaps.Tests.Unit.Services
{
    public class ReportServiceTests
    {
        private readonly Mock<IRepository<Report, int>> _mockReportRepo;
        private readonly Mock<IAIService> _mockAIService;
        private readonly Mock<IReputationService> _mockReputationService;
        private readonly Mock<IContainerUpdateService> _mockContainerUpdateService;
        private readonly ReportService _service;

        public ReportServiceTests()
        {
            _mockReportRepo = new Mock<IRepository<Report, int>>();
            _mockAIService = new Mock<IAIService>();
            _mockReputationService = new Mock<IReputationService>();
            _mockContainerUpdateService = new Mock<IContainerUpdateService>();

            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);
            _mockReputationService.Setup(r => r.IncrementAsync(It.IsAny<string>(), It.IsAny<int>())).Returns(Task.CompletedTask);
            _mockReputationService.Setup(r => r.DecrementAsync(It.IsAny<string>(), It.IsAny<int>())).Returns(Task.CompletedTask);
            _mockContainerUpdateService.Setup(s => s.ApplyReportEffectAsync(It.IsAny<int>(), It.IsAny<ReportType>())).Returns(Task.CompletedTask);

            _service = new ReportService(
                _mockReportRepo.Object,
                _mockAIService.Object,
                _mockReputationService.Object,
                _mockContainerUpdateService.Object);
        }

        #region CreateAsync Tests

        [Fact]
        public async Task CreateAsync_WithPhoto_CallsAIService()
        {
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object,
                Description = "Test"
            };

            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 85 });

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            _mockAIService.Verify(s => s.AnalyzeAsync(mockPhoto.Object), Times.Once);
        }

        [Fact]
        public async Task CreateAsync_WithoutPhoto_SkipsAIService()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null,
                Description = "Test"
            };

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            _mockAIService.Verify(s => s.AnalyzeAsync(It.IsAny<IFormFile>()), Times.Never);
        }

        [Fact]
        public async Task CreateAsync_NoPhotoUserRole_CalculatesFinalConfidenceCorrectly()
        {
            
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport.Should().NotBeNull();
            // No AI: CalculateConfidence returns (double)reputation = 50 (User role)
            capturedReport!.FinalConfidence.Should().Be(50.0);
        }

        [Fact]
        public async Task CreateAsync_WithAI_CalculatesWeightedConfidence()
        {
           
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };

            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 90 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport!.FinalConfidence.Should().Be(74.0);
        }

        [Fact]
        public async Task CreateAsync_FireReport_AutoApproved()
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Fire,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task CreateAsync_HighConfidence_AutoApproved()
        {
          
            var mockPhoto = new Mock<IFormFile>();
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = mockPhoto.Object
            };

            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 100 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "Admin");

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
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", "User");

            capturedReport!.IsApproved.Should().BeFalse();
        }

        [Theory]
        [InlineData("Driver")]
        [InlineData("Admin")]
        public async Task CreateAsync_PrivilegedRole_GetsHigherReputation(string role)
        {
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

            await _service.CreateAsync(dto, "user1", "testuser", role);

            // Driver=75 → 75*0.4=30; Admin=100 → 100*0.4=40 — both > User's 20
            capturedReport!.UserReputationOnSubmit.Should().BeGreaterThan(50);
        }

        #endregion

        #region ApproveAsync Tests

        [Fact]
        public async Task ApproveAsync_ValidReport_SetsApprovedTrue()
        {
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            await _service.ApproveAsync(1);

            report.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task ApproveAsync_CallsIncrementReputation()
        {
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            await _service.ApproveAsync(1);

            _mockReputationService.Verify(r => r.IncrementAsync("user1", It.IsAny<int>()), Times.Once);
        }

        [Fact]
        public async Task ApproveAsync_NonExistentReport_ThrowsInvalidOperation()
        {
            _mockReportRepo.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((Report)null!);

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => _service.ApproveAsync(999));
        }

        #endregion

        #region RejectAsync Tests

        [Fact]
        public async Task RejectAsync_ValidReport_SetsApprovedFalse()
        {
            var report = new Report { Id = 1, UserId = "user1", IsApproved = true };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            await _service.RejectAsync(1);

            report.IsApproved.Should().BeFalse();
        }

        [Fact]
        public async Task RejectAsync_UpdatesRepository()
        {
            var report = new Report { Id = 1, UserId = "user1", IsApproved = true };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            await _service.RejectAsync(1);

            _mockReportRepo.Verify(r => r.UpdateAsync(report), Times.Once);
        }

        [Fact]
        public async Task RejectAsync_NonExistentReport_ThrowsInvalidOperation()
        {
            _mockReportRepo.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((Report)null!);

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => _service.RejectAsync(999));
        }

        #endregion
    }
}
