using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
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
    private readonly UserManager<User> _userManager;
    private readonly BinMapsDbContext _context;
    private readonly IReputationService _reputationService;

    public UserProfileController(
        UserManager<User> userManager,
        BinMapsDbContext context,
        IReputationService reputationService)
    {
        _userManager = userManager;
        _context = context;
        _reputationService = reputationService;
    }

    #region Endpoints

    [HttpGet("me")]
    [ProducesResponseType(typeof(UserStatsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyStats()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        return await GetUserStatsInternal(userId);
    }

    [HttpGet("{id}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(UserStatsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetUserStats([FromRoute] string id)
        => await GetUserStatsInternal(id);

    [HttpPut("me")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.UserName))
            user.UserName = dto.UserName;

        if (!string.IsNullOrWhiteSpace(dto.Email))
            user.Email = dto.Email;

        if (!string.IsNullOrWhiteSpace(dto.PhoneNumber))
            user.PhoneNumber = dto.PhoneNumber;

        await _userManager.UpdateAsync(user);
        return NoContent();
    }

    #endregion

    #region Private

    private async Task<IActionResult> GetUserStatsInternal(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
            return NotFound();

        var reports = await _context.Reports
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .ToListAsync();

        var level = _reputationService.GetLevel(user.Reputation);

        return Ok(new UserStatsDto
        {
            UserId = user.Id,
            UserName = user.UserName!,
            Reputation = user.Reputation,
            ReputationLevel = level,
            TotalReports = reports.Count,
            ApprovedReports = reports.Count(r => r.IsApproved == true),
            PendingReports = reports.Count(r => r.IsApproved == null),
            RejectedReports = reports.Count(r => r.IsApproved == false)
        });
    }

    #endregion
}