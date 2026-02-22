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

            var user = new User { Id = "user1", Reputation = 70 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);

           
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            
            _mockAIService.Verify(s => s.AnalyzeAsync(It.IsAny<IFormFile>()), Times.Never);
        }

        [Fact]
        public async Task CreateAsync_CalculatesFinalConfidenceCorrectly()
        {
          
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = ReportType.Full,
                Photo = null
            };

            var user = new User { Id = "user1", Reputation = 80 }; 
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

           
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            
            capturedReport.Should().NotBeNull();
          
            capturedReport!.FinalConfidence.Should().Be(32);
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

            var user = new User { Id = "user1", Reputation = 60 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 90 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

           
            await _service.CreateAsync(dto, "user1", "testuser", "User");

           
            capturedReport!.FinalConfidence.Should().Be(78);
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

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);

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

            var user = new User { Id = "user1", Reputation = 100 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockAIService.Setup(s => s.AnalyzeAsync(It.IsAny<IFormFile>()))
                .ReturnsAsync(new AIResultDto { Confidence = 100 });

            Report? capturedReport = null;
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>()))
                .Callback<Report>(r => capturedReport = r)
                .Returns(Task.CompletedTask);

           
            await _service.CreateAsync(dto, "user1", "testuser", "User");

            
            capturedReport!.IsApproved.Should().BeTrue();
        }

        [Theory]
        [InlineData("User", ReportType.TruckProblem)]
        [InlineData("User", ReportType.ContainerDamage)]
        public async Task CreateAsync_UnauthorizedReportType_ThrowsException(string role, ReportType reportType)
        {
           
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = reportType
            };

            
            await Assert.ThrowsAsync<UnauthorizedAccessException>(
                () => _service.CreateAsync(dto, "user1", "testuser", role));
        }

        [Theory]
        [InlineData("Driver", ReportType.TruckProblem)]
        [InlineData("Admin", ReportType.ContainerDamage)]
        public async Task CreateAsync_AuthorizedRole_AllowsRestrictedReportTypes(string role, ReportType reportType)
        {
           
            var dto = new CreateReportDTO
            {
                TrashContainerId = 1,
                ReportType = reportType
            };

            var user = new User { Id = "user1", Reputation = 70 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockReportRepo.Setup(r => r.AddAsync(It.IsAny<Report>())).Returns(Task.CompletedTask);

            var exception = await Record.ExceptionAsync(
                () => _service.CreateAsync(dto, "user1", "testuser", role));

           
            exception.Should().BeNull();
        }

        #endregion

        #region ApproveAsync Tests

        [Fact]
        public async Task ApproveAsync_ValidReport_SetsApprovedTrue()
        {
           
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

           
            await _service.ApproveAsync(1);

           
            report.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task ApproveAsync_IncreasesUserReputation()
        {
            
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            await _service.ApproveAsync(1);

           
            user.Reputation.Should().Be(60);
        }

        [Fact]
        public async Task ApproveAsync_ClampsReputationAt100()
        {
           
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 95 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

           
            await _service.ApproveAsync(1);

           
            user.Reputation.Should().Be(100); 
        }

        #endregion

        #region RejectAsync Tests

        [Fact]
        public async Task RejectAsync_ValidReport_SetsApprovedFalse()
        {
            
            var report = new Report { Id = 1, UserId = "user1", IsApproved = false };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

           
            await _service.RejectAsync(1);

            
            report.IsApproved.Should().BeFalse();
        }

        [Fact]
        public async Task RejectAsync_DecreasesUserReputation()
        {
            
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 50 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

           
            await _service.RejectAsync(1);

            
            user.Reputation.Should().Be(45); 
        }

        [Fact]
        public async Task RejectAsync_ClampsReputationAt0()
        {
            
            var report = new Report { Id = 1, UserId = "user1" };
            _mockReportRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(report);
            _mockReportRepo.Setup(r => r.UpdateAsync(report)).ReturnsAsync(true);

            var user = new User { Id = "user1", Reputation = 3 };
            _mockUserManager.Setup(m => m.FindByIdAsync("user1")).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.UpdateAsync(user)).ReturnsAsync(IdentityResult.Success);

            
            await _service.RejectAsync(1);

          
            user.Reputation.Should().Be(0); 
        }

        #endregion
    }
}