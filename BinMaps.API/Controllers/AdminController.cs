using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.API.Controllers;

[ApiController]
[Route("api/admin")]
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

    #region Containers (for Admin Dashboard)
    [HttpGet("containers")]
    public async Task<IActionResult> GetContainers()
    {
        var containers = await _context.TrashContainers
            .AsNoTracking()
            .Select(c => new
            {
                c.Id,
                c.AreaId,
                c.TrashType,
                c.FillPercentage,
                c.Status,
                c.HasSensor,
                c.Temperature,
                c.BatteryPercentage
            })
            .ToListAsync();

        return Ok(containers);
    }
    #endregion

    #region Trucks (for Admin Dashboard)
    [HttpGet("trucks")]
    public async Task<IActionResult> GetTrucks()
    {
        var trucks = await _context.Trucks
            .AsNoTracking()
            .Select(t => new
            {
                t.Id,
                t.AreaId,
                t.TrashType,
                t.Capacity,
                t.LocationX,
                t.LocationY
            })
            .ToListAsync();

        return Ok(trucks);
    }
    #endregion

    #region Users
    [HttpGet("users")]
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
    public async Task<IActionResult> ChangeRole([FromRoute] string id, [FromBody] string newRole)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        var currentRoles = await _userManager.GetRolesAsync(user);
        await _userManager.RemoveFromRolesAsync(user, currentRoles);
        await _userManager.AddToRoleAsync(user, newRole);

        return NoContent();
    }

    [HttpPut("users/{id}/reputation")]  
    public async Task<IActionResult> SetReputation([FromRoute] string id, [FromBody] int value)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        user.Reputation = Math.Clamp(value, 0, 100);
        await _userManager.UpdateAsync(user);

        return NoContent();
    }

    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser([FromRoute] string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        await _userManager.DeleteAsync(user);
        return NoContent();
    }
    #endregion

    #region Pending Reports
    [HttpGet("reports/pending")]
    public async Task<IActionResult> GetPendingReports()
    {
        var pending = await _context.Reports
            .AsNoTracking()
           .Where(r => !r.IsApproved)
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