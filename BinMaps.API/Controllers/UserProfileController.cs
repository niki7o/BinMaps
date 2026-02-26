using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public sealed class UserProfileController : ControllerBase
{
    private readonly BinMapsDbContext _context;
    private readonly UserManager<User> _userManager;
    private readonly IWebHostEnvironment _environment;
    private readonly IReputationService _reputationService;

    public UserProfileController(
        BinMapsDbContext context,
        UserManager<User> userManager,
        IWebHostEnvironment environment,
        IReputationService reputationService)
    {
        _context = context;
        _userManager = userManager;
        _environment = environment;
        _reputationService = reputationService;
    }

    #region Profile

    [HttpGet]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUserProfile()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        return await BuildProfileResponse(userId);
    }

    [HttpGet("{userId}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetUserProfile([FromRoute] string userId)
    {
        var exists = await _userManager.FindByIdAsync(userId);
        if (exists is null)
            return NotFound();

        return await BuildProfileResponse(userId);
    }

    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(request.UserName))
            user.UserName = request.UserName;

        if (!string.IsNullOrWhiteSpace(request.Email))
            user.Email = request.Email;

        if (!string.IsNullOrWhiteSpace(request.PhoneNumber))
            user.PhoneNumber = request.PhoneNumber;

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });

        return NoContent();
    }

    #endregion

    #region Profile Picture

    [HttpPost("upload-picture")]
    public async Task<IActionResult> UploadProfilePicture(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Няма избрана снимка.");

        if (!file.ContentType.StartsWith("image/"))
            return BadRequest("Само изображения са позволени.");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _userManager.FindByIdAsync(userId!);

        if (user == null)
            return NotFound();

        if (file.Length > 5 * 1024 * 1024)
            return BadRequest("Снимката е твърде голяма (макс. 5MB).");

        var webRoot = _environment.WebRootPath;
        var uploadsDir = Path.Combine(webRoot, "uploads", "profiles");
        Directory.CreateDirectory(uploadsDir);

        if (!string.IsNullOrEmpty(user.ProfilePicturePath))
        {
            var oldPath = Path.Combine(webRoot, user.ProfilePicturePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(oldPath))
                System.IO.File.Delete(oldPath);
        }

        var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var relativePath = $"/uploads/profiles/{fileName}";
        var fullPath = Path.Combine(uploadsDir, fileName);

        await using (var stream = new FileStream(fullPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        user.ProfilePicturePath = relativePath;
        await _userManager.UpdateAsync(user);

        return Ok(new { profilePicturePath = relativePath });
    }

    [HttpDelete("picture")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteProfilePicture()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        if (string.IsNullOrEmpty(user.ProfilePicturePath))
            return NotFound();

        var webRoot = _environment.WebRootPath ??
                      Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

     
        DeleteOldPicture(user.ProfilePicturePath, webRoot);

        user.ProfilePicturePath = null;
        await _userManager.UpdateAsync(user);

        return NoContent();
    }

    #endregion

    #region Reports & Stats

    [HttpGet("reports")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetUserReports()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var reports = await _context.Reports
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                ReportType = r.ReportType.ToString(),
                r.Description,
                r.CreatedAt,
                r.IsApproved,
                r.AI_Score,
                r.FinalConfidence,
                ContainerId = r.TrashContainerId,
                Container = r.TrashContainer != null
                    ? new { r.TrashContainer.Id, r.TrashContainer.AreaId, TrashType = r.TrashContainer.TrashType.ToString() }
                    : null
            })
            .ToListAsync();

        return Ok(reports);
    }

    [HttpGet("stats")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetUserStats()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var totalReports = await _context.Reports.CountAsync(r => r.UserId == userId);
        var approvedReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved == true);
        var pendingReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved == null);

        var recentReports = await _context.Reports
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(5)
            .Select(r => new
            {
                ReportType = r.ReportType.ToString(),
                r.CreatedAt,
                r.IsApproved
            })
            .ToListAsync();

        return Ok(new
        {
            totalReports,
            approvedReports,
            pendingReports,
            recentActivity = recentReports
        });
    }

    [HttpGet("reputation")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetReputation()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        var level = _reputationService.GetLevel(user.Reputation);
        var nextThreshold = _reputationService.GetNextLevelThreshold(level);

        return Ok(new
        {
            reputation = user.Reputation,
            level,
            nextLevel = nextThreshold,
            progress = nextThreshold > 0 ? Math.Round((double)user.Reputation / nextThreshold * 100, 1) : 100.0
        });
    }

    #endregion

    #region Private Helpers

    private async Task<IActionResult> BuildProfileResponse(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? "User";

        var level = _reputationService.GetLevel(user.Reputation);

        var totalReports = await _context.Reports.CountAsync(r => r.UserId == userId);
        var approvedReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved == true);

        return Ok(new
        {
            userId = user.Id,
            userName = user.UserName,
            email = user.Email,
            phoneNumber = user.PhoneNumber,
            profilePicturePath = user.ProfilePicturePath,
            role,
            reputation = user.Reputation,
            level,
            totalReports,
            approvedReports,
            memberSince = user.CreatedAt
        });
    }

    private static void DeleteOldPicture(string? relativePath, string webRoot)
    {
        if (string.IsNullOrEmpty(relativePath))
            return;

        var fullPath = Path.Combine(
            webRoot,
            relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)
        );

        if (System.IO.File.Exists(fullPath))
            System.IO.File.Delete(fullPath);
    }
    #endregion
}

public sealed record UpdateProfileRequest(
    string? UserName,
    string? Email,
    string? PhoneNumber
);