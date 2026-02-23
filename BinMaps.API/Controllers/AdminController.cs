using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
[Produces("application/json")]
public sealed class AdminController : ControllerBase
{
    private readonly UserManager<User> _userManager;
    private readonly BinMapsDbContext _context;

    public AdminController(UserManager<User> userManager, BinMapsDbContext context)
    {
        _userManager = userManager;
        _context = context;
    }

    #region Stats

    [HttpGet("stats")]
    [ProducesResponseType(typeof(AdminStatsDTO), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStats()
    {
        var containers = await _context.TrashContainers.AsNoTracking().ToListAsync();
        var reports = await _context.Reports.AsNoTracking().ToListAsync();
        var userCount = await _userManager.Users.CountAsync();

        return Ok(new AdminStatsDTO
        {
            TotalContainers = containers.Count,
            CriticalContainers = containers.Count(c => c.FillPercentage >= 80),
            TotalUsers = userCount,
            PendingReports = reports.Count(r => r.IsApproved == null),
            ApprovedReports = reports.Count(r => r.IsApproved == true),
            RejectedReports = reports.Count(r => r.IsApproved == false),
            AverageFillPercent = containers.Count > 0
                ? Math.Round(containers.Average(c => c.FillPercentage), 1)
                : 0
        });
    }

    #endregion

    #region User Management

    [HttpGet("users")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _userManager.Users.AsNoTracking().ToListAsync();

        var result = new List<object>();
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new
            {
                user.Id,
                user.UserName,
                user.Email,
                user.Reputation,
                user.CreatedAt,
                Role = roles.FirstOrDefault() ?? "User"
            });
        }

        return Ok(result);
    }

    [HttpPut("users/{id}/role")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ChangeRole([FromRoute] string id, [FromBody] string newRole)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        var currentRoles = await _userManager.GetRolesAsync(user);
        await _userManager.RemoveFromRolesAsync(user, currentRoles);
        await _userManager.AddToRoleAsync(user, newRole);

        return NoContent();
    }

    [HttpDelete("users/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteUser([FromRoute] string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        await _userManager.DeleteAsync(user);
        return NoContent();
    }

    #endregion

    #region Pending Reports

    [HttpGet("reports/pending")]
    [ProducesResponseType(typeof(IEnumerable<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPendingReports()
    {
        var pending = await _context.Reports
            .AsNoTracking()
            .Where(r => r.IsApproved == null)
            .OrderByDescending(r => r.FinalConfidence)
            .Select(r => new
            {
                r.Id,
                r.UserName,
                r.TrashContainerId,
                ReportType = r.ReportType.ToString(),
                r.FinalConfidence,
                r.AI_Score,
                r.UserReputationOnSubmit,
                r.PhotoURL,
                r.Description,
                r.CreatedAt
            })
            .ToListAsync();

        return Ok(pending);
    }

    #endregion
}