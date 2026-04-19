﻿using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
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
        // Global query filter already hides soft-deleted containers.
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
                c.BatteryPercentage,
                c.IsSeeded
            })
            .ToListAsync();

        return Ok(containers);
    }

    /// <summary>
    /// Soft-deletes seeded containers (admin can restore them) and hard-deletes
    /// everything else. Reports referencing the container are also removed on
    /// hard-delete to respect the FK Restrict rule.
    /// </summary>
    [HttpDelete("containers/{id:int}")]
    public async Task<IActionResult> DeleteContainer([FromRoute] int id)
    {
        var container = await _context.TrashContainers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == id);
        if (container is null) return NotFound();

        if (container.IsDeleted)
            return BadRequest(new { message = "Контейнерът вече е изтрит." });

        if (container.IsSeeded)
        {
            // Soft-delete: keep row, hide via global query filter, allow restore.
            container.IsDeleted = true;
            container.DeletedAt = DateTime.UtcNow;
            container.DeletedByUserId = _userManager.GetUserId(User);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                mode = "soft",
                id = container.Id,
                message = "Seed контейнерът е архивиран и може да бъде възстановен."
            });
        }

        // Hard-delete: user-added container. Clean up related reports first
        // because Report.TrashContainerId is Restrict-on-delete.
        var reports = await _context.Reports
            .Where(r => r.TrashContainerId == id)
            .ToListAsync();
        if (reports.Count > 0)
            _context.Reports.RemoveRange(reports);

        _context.TrashContainers.Remove(container);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            mode = "hard",
            id,
            reportsRemoved = reports.Count,
            message = "Контейнерът е премахнат окончателно."
        });
    }

    [HttpGet("containers/deleted")]
    public async Task<IActionResult> GetDeletedContainers()
    {
        var items = await _context.TrashContainers
            .IgnoreQueryFilters()
            .Where(c => c.IsDeleted)
            .AsNoTracking()
            .OrderByDescending(c => c.DeletedAt)
            .Select(c => new
            {
                c.Id,
                c.AreaId,
                c.TrashType,
                c.LocationX,
                c.LocationY,
                c.Capacity,
                c.HasSensor,
                c.DeletedAt,
                c.DeletedByUserId
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("containers/{id:int}/restore")]
    public async Task<IActionResult> RestoreContainer([FromRoute] int id)
    {
        var container = await _context.TrashContainers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == id);
        if (container is null) return NotFound();

        if (!container.IsDeleted)
            return BadRequest(new { message = "Контейнерът не е изтрит." });

        if (!container.IsSeeded)
            return BadRequest(new { message = "Само seed контейнери могат да бъдат възстановявани." });

        container.IsDeleted = false;
        container.DeletedAt = null;
        container.DeletedByUserId = null;
        await _context.SaveChangesAsync();

        return Ok(new { id, message = "Контейнерът е възстановен." });
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

    [HttpPut("trucks/{id:int}/trashtype")]
    public async Task<IActionResult> UpdateTruckTrashType([FromRoute] int id, [FromBody] int trashType)
    {
        if (!Enum.IsDefined(typeof(Data.Entities.Enums.TrashType), trashType))
            return BadRequest(new { message = "Невалиден тип отпадък." });

        var truck = await _context.Trucks.FindAsync(id);
        if (truck is null) return NotFound();

        truck.TrashType = (Data.Entities.Enums.TrashType)trashType;
        await _context.SaveChangesAsync();
        return NoContent();
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
            var roles  = await _userManager.GetRolesAsync(user);
            var claims = await _userManager.GetClaimsAsync(user);

            var isBanned  = user.LockoutEnd.HasValue && user.LockoutEnd > DateTimeOffset.UtcNow;
            var banReason = claims.FirstOrDefault(c => c.Type == "ban_reason")?.Value;

            result.Add(new
            {
                user.Id,
                user.UserName,
                user.Email,
                user.Reputation,
                user.CreatedAt,
                Role  = roles.FirstOrDefault() ?? "User",
                IsBanned = isBanned,
                BanReason= banReason,
                BannedAt  = isBanned ? (DateTimeOffset?)user.LockoutEnd : null
            });
        }

        return Ok(result);
    }

    [HttpPut("users/{id}/ban")]
    public async Task<IActionResult> BanUser([FromRoute] string id, [FromBody] string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
            return BadRequest(new { message = "Причината за бан е задължителна." });

        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains("Admin"))
            return BadRequest(new { message = "Не можете да блокирате администратор." });

        await _userManager.SetLockoutEnabledAsync(user, true);
        await _userManager.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);

        var existingClaims = await _userManager.GetClaimsAsync(user);
        var existing = existingClaims.FirstOrDefault(c => c.Type == "ban_reason");
        if (existing is not null)
            await _userManager.RemoveClaimAsync(user, existing);
        await _userManager.AddClaimAsync(user, new System.Security.Claims.Claim("ban_reason", reason.Trim()));

        return NoContent();
    }

    [HttpPut("users/{id}/unban")]
    public async Task<IActionResult> UnbanUser([FromRoute] string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        await _userManager.SetLockoutEndDateAsync(user, null);

        var claims  = await _userManager.GetClaimsAsync(user);
        var banClaim = claims.FirstOrDefault(c => c.Type == "ban_reason");
        if (banClaim is not null)
            await _userManager.RemoveClaimAsync(user, banClaim);

        return NoContent();
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

    #region Reports
    [HttpGet("reports")]
    public async Task<IActionResult> GetAllReports(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null,
        [FromQuery] string? reportType = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _context.Reports.AsNoTracking().AsQueryable();

        if (status == "pending")  query = query.Where(r => r.IsApproved == null);
        else if (status == "approved") query = query.Where(r => r.IsApproved == true);
        else if (status == "rejected") query = query.Where(r => r.IsApproved == false);

        if (!string.IsNullOrEmpty(reportType) && Enum.TryParse<ReportType>(reportType, out var rt))
            query = query.Where(r => r.ReportType == rt);

        query = query.OrderByDescending(r => r.CreatedAt);

        var total = await query.CountAsync();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.UserId,
                r.UserName,
                r.TrashContainerId,
                ReportType = r.ReportType.ToString(),
                r.FinalConfidence,
                AiScore = r.AI_Score,
                r.UserReputationOnSubmit,
                r.IsApproved,
                r.PhotoURL,
                r.Description,
                r.CreatedAt
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpGet("reports/pending")]
    public async Task<IActionResult> GetPendingReports()
    {
        var pending = await _context.Reports
            .AsNoTracking()
            .Where(r => r.IsApproved == null)
            .OrderByDescending(r => r.FinalConfidence)
            .Select(r => new
            {
                r.Id,
                r.UserId,
                r.UserName,
                r.TrashContainerId,
                ReportType = r.ReportType.ToString(),
                r.FinalConfidence,
                AiScore = r.AI_Score,
                r.UserReputationOnSubmit,
                r.IsApproved,
                r.PhotoURL,
                r.Description,
                r.CreatedAt
            })
            .ToListAsync();

        return Ok(pending);
    }
    #endregion
}