using Xunit;
using Moq;
using FluentAssertions;
using BinMaps.Infrastructure.Services;
using BinMaps.Data.Entities;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;


namespace BinMaps.Tests.Unit.Services
{
    public class AuthServiceTests
    {
        #region Fields

        private readonly Mock<UserManager<User>> _mockUserManager;
        private readonly Mock<SignInManager<User>> _mockSignInManager;
        private readonly Mock<IConfiguration> _mockConfig;
        private readonly AuthService _service;

        #endregion

        #region Constructor

        public AuthServiceTests()
        {
            var userStoreMock = new Mock<IUserStore<User>>();

            _mockUserManager = new Mock<UserManager<User>>(
                userStoreMock.Object,
                Mock.Of<IOptions<IdentityOptions>>(),
                Mock.Of<IPasswordHasher<User>>(),
                new IUserValidator<User>[0],
                new IPasswordValidator<User>[0],
                Mock.Of<ILookupNormalizer>(),
                Mock.Of<IdentityErrorDescriber>(),
                Mock.Of<IServiceProvider>(),
                Mock.Of<ILogger<UserManager<User>>>());

            _mockSignInManager = new Mock<SignInManager<User>>(
                _mockUserManager.Object,
                Mock.Of<Microsoft.AspNetCore.Http.IHttpContextAccessor>(),
                Mock.Of<IUserClaimsPrincipalFactory<User>>(),
                Mock.Of<IOptions<IdentityOptions>>(),
                Mock.Of<ILogger<SignInManager<User>>>(),
                Mock.Of<Microsoft.AspNetCore.Authentication.IAuthenticationSchemeProvider>(),
                Mock.Of<IUserConfirmation<User>>());

            _mockConfig = new Mock<IConfiguration>();
            _mockConfig.Setup(c => c["Jwt:Key"]).Returns("SuperSecretKeyThatIsAtLeast32CharactersLong12345678");
            _mockConfig.Setup(c => c["Jwt:Issuer"]).Returns("BinMapsAPI");
            _mockConfig.Setup(c => c["Jwt:Audience"]).Returns("BinMapsClient");
            _mockConfig.Setup(c => c["Jwt:ExpireDays"]).Returns("7");

            _mockUserManager
                .Setup(m => m.GetClaimsAsync(It.IsAny<User>()))
                .ReturnsAsync(new List<System.Security.Claims.Claim>());

            _service = new AuthService(_mockUserManager.Object, _mockSignInManager.Object, _mockConfig.Object);
        }

        #endregion

        #region RegisterAsync Tests

        [Fact]
        public async Task RegisterAsync_ValidUser_ReturnsSuccess()
        {
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "newuser@example.com",
                Password = "Password123!",
                PhoneNumber = "1234567890",
                AcceptTerms = true
            };

            var emptyUsers = new List<User>().AsQueryable();
            var mockSet = CreateMockAsyncQueryable(emptyUsers);

            _mockUserManager.Setup(m => m.Users).Returns(mockSet);
            _mockUserManager.Setup(m => m.FindByNameAsync(It.IsAny<string>())).ReturnsAsync((User)null!);
            _mockUserManager.Setup(m => m.FindByEmailAsync(It.IsAny<string>())).ReturnsAsync((User)null!);
            _mockUserManager.Setup(m => m.CreateAsync(It.IsAny<User>(), It.IsAny<string>()))
                .ReturnsAsync(IdentityResult.Success);
            _mockUserManager.Setup(m => m.AddToRoleAsync(It.IsAny<User>(), "User"))
                .ReturnsAsync(IdentityResult.Success);

            var (success, errors) = await _service.RegisterAsync(dto);

            success.Should().BeTrue();
            errors.Should().BeEmpty();
        }

        [Fact]
        public async Task RegisterAsync_DuplicateEmail_ReturnsFail()
        {
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "existing@example.com",
                Password = "Password123!",
                AcceptTerms = true
            };

            var existingUser = new User { Email = "existing@example.com" };
            var users = new List<User> { existingUser }.AsQueryable();
            var mockSet = CreateMockAsyncQueryable(users);

            _mockUserManager.Setup(m => m.Users).Returns(mockSet);

            var (success, errors) = await _service.RegisterAsync(dto);

            success.Should().BeFalse();
            errors.Should().Contain("Имейлът вече е зает.");
        }

        [Fact]
        public async Task RegisterAsync_NoTermsAccepted_ReturnsFail()
        {
            var dto = new RegisterDTO
            {
                UserName = "newuser",
                Email = "newuser@example.com",
                Password = "Password123!",
                AcceptTerms = false
            };

            var (success, errors) = await _service.RegisterAsync(dto);

            success.Should().BeFalse();
            errors.Should().Contain("Трябва да приемете условията за ползване.");
        }

        #endregion

        #region LoginAsync Tests

        [Fact]
        public async Task LoginAsync_ValidCredentials_ReturnsSuccessWithToken()
        {
            var dto = new LoginDTO
            {
                Email = "test@example.com",
                Password = "Password123!"
            };

            var user = new User { Id = "user1", Email = "test@example.com", UserName = "testuser" };
            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.CheckPasswordAsync(user, dto.Password)).ReturnsAsync(true);
            _mockUserManager.Setup(m => m.GetRolesAsync(user)).ReturnsAsync(new List<string> { "User" });

            var (success, result) = await _service.LoginAsync(dto);

            success.Should().BeTrue();
            result.Should().NotBeNull();
            result!.Role.Should().Be("User");
            result.Token.Should().NotBeNullOrEmpty();
        }

        [Fact]
        public async Task LoginAsync_InvalidEmail_ReturnsFail()
        {
            var dto = new LoginDTO
            {
                Email = "nonexistent@example.com",
                Password = "Password123!"
            };

            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync((User)null!);

            var (success, result) = await _service.LoginAsync(dto);

            success.Should().BeFalse();
            result.Should().BeNull();
        }

        [Fact]
        public async Task LoginAsync_InvalidPassword_ReturnsFail()
        {
            var dto = new LoginDTO
            {
                Email = "test@example.com",
                Password = "WrongPassword!"
            };

            var user = new User { Id = "user1", Email = "test@example.com" };
            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.CheckPasswordAsync(user, dto.Password)).ReturnsAsync(false);

            var (success, result) = await _service.LoginAsync(dto);

            success.Should().BeFalse();
            result.Should().BeNull();
        }

        [Theory]
        [InlineData("Admin")]
        [InlineData("Driver")]
        [InlineData("User")]
        public async Task LoginAsync_ReturnsCorrectRole(string expectedRole)
        {
            var dto = new LoginDTO { Email = "test@example.com", Password = "Password123!" };
            var user = new User { Id = "user1", Email = "test@example.com", UserName = "testuser" };

            _mockUserManager.Setup(m => m.FindByEmailAsync(dto.Email)).ReturnsAsync(user);
            _mockUserManager.Setup(m => m.CheckPasswordAsync(user, dto.Password)).ReturnsAsync(true);
            _mockUserManager.Setup(m => m.GetRolesAsync(user)).ReturnsAsync(new List<string> { expectedRole });

            var (success, result) = await _service.LoginAsync(dto);

            success.Should().BeTrue();
            result!.Role.Should().Be(expectedRole);
        }

        #endregion

        #region Helper Methods

        private static IQueryable<User> CreateMockAsyncQueryable(IQueryable<User> data)
        {
            return new TestAsyncEnumerable<User>(data);
        }

        #endregion
    }
}