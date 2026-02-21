using Xunit;
using Moq;
using FluentAssertions;
using BinMaps.Infrastructure.Services;
using BinMaps.Data.Entities;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;

namespace BinMaps.Tests.Unit.Services
{
    public class AuthServiceTests
    {
        private readonly Mock<UserManager<User>> _mockUserManager;
        private readonly Mock<SignInManager<User>> _mockSignInManager;
        private readonly Mock<IConfiguration> _mockConfig;
        private readonly AuthService _service;

        public AuthServiceTests()
        {
            var userStoreMock = new Mock<IUserStore<User>>();
            _mockUserManager = new Mock<UserManager<User>>(
                userStoreMock.Object, null, null, null, null, null, null, null, null);

            _mockSignInManager = new Mock<SignInManager<User>>(
                _mockUserManager.Object,
                Mock.Of<Microsoft.AspNetCore.Http.IHttpContextAccessor>(),
                Mock.Of<IUserClaimsPrincipalFactory<User>>(),
                null, null, null, null);

            _mockConfig = new Mock<IConfiguration>();
            _mockConfig.Setup(c => c["Jwt:Key"]).Returns("SuperSecretKeyThatIsAtLeast32CharactersLong12345678");
            _mockConfig.Setup(c => c["Jwt:Issuer"]).Returns("BinMapsAPI");
            _mockConfig.Setup(c => c["Jwt:Audience"]).Returns("BinMapsClient");
            _mockConfig.Setup(c => c["Jwt:ExpireDays"]).Returns("7");

            _service = new AuthService(_mockUserManager.Object, _mockSignInManager.Object, _mockConfig.Object);
        }

        #region RegisterAsync Tests

        [Fact]
        public async Task RegisterAsync_ValidUser_ReturnsSuccess()
        {
            // Arrange
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "newuser@example.com",
                Password = "Password123!",
                PhoneNumber = "1234567890",
                AcceptTerms = true
            };

            _mockUserManager.Setup(m => m.Users).Returns(new List<User>().AsQueryable());
            _mockUserManager.Setup(m => m.FindByNameAsync(It.IsAny<string>())).ReturnsAsync((User)null);
            _mockUserManager.Setup(m => m.FindByEmailAsync(It.IsAny<string>())).ReturnsAsync((User)null);
            _mockUserManager.Setup(m => m.CreateAsync(It.IsAny<User>(), It.IsAny<string>()))
                .ReturnsAsync(IdentityResult.Success);
            _mockUserManager.Setup(m => m.AddToRoleAsync(It.IsAny<User>(), "User"))
                .ReturnsAsync(IdentityResult.Success);

            // Act
            var (success, errors) = await _service.RegisterAsync(dto);

            // Assert
            success.Should().BeTrue();
            errors.Should().BeNull();
        }

        [Fact]
        public async Task RegisterAsync_DuplicateEmail_ReturnsFail()
        {
            // Arrange
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "existing@example.com",
                Password = "Password123!",
                AcceptTerms = true
            };

            var existingUser = new User { Email = "existing@example.com" };
            _mockUserManager.Setup(m => m.Users).Returns(new List<User> { existingUser }.AsQueryable());

            // Act
            var (success, errors) = await _service.RegisterAsync(dto);

            // Assert
            success.Should().BeFalse();
            errors.Should().Contain("Този имейл вече е зает.");
        }

        [Fact]
        public async Task RegisterAsync_NoTermsAccepted_ReturnsFail()
        {
            // Arrange
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "newuser@example.com",
                Password = "Password123!",
                AcceptTerms = false  // Not accepted
            };

            _mockUserManager.Setup(m => m.Users).Returns(new List<User>().AsQueryable());
            _mockUserManager.Setup(m => m.FindByNameAsync(It.IsAny<string>())).ReturnsAsync((User)null);
            _mockUserManager.Setup(m => m.FindByEmailAsync(It.IsAny<string>())).ReturnsAsync((User)null);

            // Act
            var (success, errors) = await _service.RegisterAsync(dto);

            // Assert
            success.Should().BeFalse();
            errors.Should().Contain("Трябва да приемете условията за ползване.");
        }

        #endregion

        #region LoginAsync Tests

        [Fact]
        public async Task LoginAsync_ValidCredentials_ReturnsSuccessWithToken()
        {
            // Arrange
            var dto = new LoginDTO
            {
                Email = "test@example.com",
                Password = "Password123!"
            };

            var user = new User { Id = "user1", Email = "test@example.com", UserName = "testuser" };
            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockSignInManager.Setup(m => m.CheckPasswordSignInAsync(user, dto.Password, false))
                .ReturnsAsync(Microsoft.AspNetCore.Identity.SignInResult.Success);
            _mockUserManager.Setup(m => m.GetRolesAsync(user)).ReturnsAsync(new List<string> { "User" });

            // Act
            var (success, role, token) = await _service.LoginAsync(dto);

            // Assert
            success.Should().BeTrue();
            role.Should().Be("User");
            token.Should().NotBeNullOrEmpty();
        }

        [Fact]
        public async Task LoginAsync_InvalidEmail_ReturnsFail()
        {
            // Arrange
            var dto = new LoginDTO
            {
                Email = "nonexistent@example.com",
                Password = "Password123!"
            };

            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync((User)null);

            // Act
            var (success, role, token) = await _service.LoginAsync(dto);

            // Assert
            success.Should().BeFalse();
            role.Should().BeNull();
            token.Should().BeNull();
        }

        [Fact]
        public async Task LoginAsync_InvalidPassword_ReturnsFail()
        {
            // Arrange
            var dto = new LoginDTO
            {
                Email = "test@example.com",
                Password = "WrongPassword!"
            };

            var user = new User { Id = "user1", Email = "test@example.com" };
            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockSignInManager.Setup(m => m.CheckPasswordSignInAsync(user, dto.Password, false))
                .ReturnsAsync(Microsoft.AspNetCore.Identity.SignInResult.Failed);

            // Act
            var (success, role, token) = await _service.LoginAsync(dto);

            // Assert
            success.Should().BeFalse();
        }

        [Theory]
        [InlineData("Admin")]
        [InlineData("Driver")]
        [InlineData("User")]
        public async Task LoginAsync_ReturnsCorrectRole(string expectedRole)
        {
            // Arrange
            var dto = new LoginDTO { Email = "test@example.com", Password = "Password123!" };
            var user = new User { Id = "user1", Email = "test@example.com", UserName = "testuser" };

            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockSignInManager.Setup(m => m.CheckPasswordSignInAsync(user, dto.Password, false))
                .ReturnsAsync(Microsoft.AspNetCore.Identity.SignInResult.Success);
            _mockUserManager.Setup(m => m.GetRolesAsync(user)).ReturnsAsync(new List<string> { expectedRole });

            // Act
            var (success, role, token) = await _service.LoginAsync(dto);

            // Assert
            role.Should().Be(expectedRole);
        }

        #endregion
    }
}