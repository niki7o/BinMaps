﻿using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Diagnostics;
using System.Net.Http;

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
    /// Soft-deletes any container (seeded or user-added). The row is hidden via
    /// the global query filter and shows up in the "Архивирани" tab where the
    /// admin can either restore it or remove it permanently via the dedicated
    /// /permanent endpoint.
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

        // Soft-delete: keep row, hide via global query filter, allow restore.
        container.IsDeleted = true;
        container.DeletedAt = DateTime.UtcNow;
        container.DeletedByUserId = _userManager.GetUserId(User);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            mode = "soft",
            id = container.Id,
            isSeeded = container.IsSeeded,
            message = "Контейнерът е архивиран и може да бъде възстановен."
        });
    }

    /// <summary>
    /// Permanently removes an already-archived container and any reports that
    /// reference it (FK is Restrict-on-delete, so we drop reports first).
    /// </summary>
    [HttpDelete("containers/{id:int}/permanent")]
    public async Task<IActionResult> DeleteContainerPermanent([FromRoute] int id)
    {
        var container = await _context.TrashContainers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == id);
        if (container is null) return NotFound();

        if (!container.IsDeleted)
            return BadRequest(new
            {
                message = "Контейнерът трябва първо да бъде архивиран."
            });

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
                c.IsSeeded,
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

    public sealed class BulkDeleteReportsDto
    {
        public List<int> Ids { get; set; } = new();
    }

    /// <summary>
    /// Permanently deletes the given report IDs and their photo files.
    /// Used by the admin "изтрий избраните" bulk action.
    /// </summary>
    [HttpPost("reports/bulk-delete")]
    public async Task<IActionResult> BulkDeleteReports(
        [FromBody] BulkDeleteReportsDto dto,
        [FromServices] IWebHostEnvironment env)
    {
        if (dto is null || dto.Ids is null || dto.Ids.Count == 0)
            return BadRequest(new { error = "Липсват идентификатори." });

        // Cap to prevent accidental mass-deletion in one request.
        var ids = dto.Ids.Distinct().Take(1000).ToList();

        var reports = await _context.Reports
            .Where(r => ids.Contains(r.Id))
            .ToListAsync();

        if (reports.Count == 0)
            return Ok(new { deleted = 0, photosRemoved = 0 });

        // Clean up photo files from disk before deleting DB rows so we don't
        // leave orphans. Non-fatal — if the file is already gone we keep going.
        var webRoot = env.WebRootPath
            ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var photosRemoved = 0;

        foreach (var r in reports)
        {
            if (string.IsNullOrWhiteSpace(r.PhotoURL)) continue;

            // PhotoURL is stored as "/uploads/reports/{filename}" — convert to disk path.
            var relative = r.PhotoURL.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.Combine(webRoot, relative);

            try
            {
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                    photosRemoved++;
                }
            }
            catch
            {
                // Swallow: photo cleanup is best-effort.
            }
        }

        _context.Reports.RemoveRange(reports);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            deleted = reports.Count,
            photosRemoved,
            message = $"Изтрити {reports.Count} сигнала."
        });
    }

    /// <summary>
    /// Permanently deletes ALL reports matching the optional status / reportType filter.
    /// Use with care — confirmed by the admin in the UI.
    /// </summary>
    [HttpPost("reports/delete-all")]
    public async Task<IActionResult> DeleteAllReports(
        [FromQuery] string? status,
        [FromQuery] string? reportType,
        [FromServices] IWebHostEnvironment env)
    {
        var query = _context.Reports.AsQueryable();

        if (status == "pending")       query = query.Where(r => r.IsApproved == null);
        else if (status == "approved") query = query.Where(r => r.IsApproved == true);
        else if (status == "rejected") query = query.Where(r => r.IsApproved == false);

        if (!string.IsNullOrEmpty(reportType) && Enum.TryParse<ReportType>(reportType, out var rt))
            query = query.Where(r => r.ReportType == rt);

        var reports = await query.ToListAsync();
        if (reports.Count == 0)
            return Ok(new { deleted = 0, photosRemoved = 0 });

        var webRoot = env.WebRootPath
            ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var photosRemoved = 0;

        foreach (var r in reports)
        {
            if (string.IsNullOrWhiteSpace(r.PhotoURL)) continue;
            var relative = r.PhotoURL.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.Combine(webRoot, relative);
            try
            {
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                    photosRemoved++;
                }
            }
            catch { /* best effort */ }
        }

        _context.Reports.RemoveRange(reports);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            deleted = reports.Count,
            photosRemoved,
            message = $"Изтрити {reports.Count} сигнала по зададения филтър."
        });
    }
    #endregion

    #region Schema heal (manual trigger)

    /// <summary>
    /// Admin-only manual trigger that runs the same idempotent
    /// CREATE-IF-NOT-EXISTS SQL the startup auto-heal does, but on
    /// demand. Useful when:
    ///   • You can't tell from logs whether startup heal ran.
    ///   • The auto-heal is being skipped for any reason.
    ///   • You just want to verify the table exists right now.
    ///
    /// Returns a per-table report so you can see exactly what's
    /// currently in the database. Idempotent — safe to call repeatedly.
    /// </summary>
    [HttpPost("diagnostics/heal-schema")]
    public async Task<IActionResult> HealSchema()
    {
        var report = new List<object>();

        // Mirror the same critical-table list as Program.EnsureCriticalTablesExistAsync
        // to keep the on-demand path and the startup path identical.
        var targets = new (string Table, string? HealSql)[]
        {
            ("Areas",           null),
            ("Trucks",          null),
            ("TrashContainers", null),
            ("Reports",         null),
            ("RouteRuns",       RouteRunsCreateSql),
        };

        foreach (var (table, healSql) in targets)
        {
            var beforeExists = await TableExistsAsync(table);

            if (beforeExists)
            {
                report.Add(new { table, status = "ok", action = "none" });
                continue;
            }

            if (healSql is null)
            {
                report.Add(new
                {
                    table,
                    status = "missing",
                    action = "none",
                    note = "No auto-heal SQL configured for this table."
                });
                continue;
            }

            string action;
            string? error = null;
            try
            {
                await _context.Database.ExecuteSqlRawAsync(healSql);
                action = "heal-sql-executed";

                // Record EF migration as applied so future MigrateAsync
                // doesn't try to recreate the table.
                await _context.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'[dbo].[__EFMigrationsHistory]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[__EFMigrationsHistory] (
        [MigrationId]    NVARCHAR(150) NOT NULL,
        [ProductVersion] NVARCHAR(32)  NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;");
                await _context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT 1 FROM [__EFMigrationsHistory] WHERE [MigrationId] = {0})
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion]) VALUES ({0}, {1});",
                    "20260429180000_FixRouteRunsTable", "8.0.13");
            }
            catch (Exception ex)
            {
                action = "heal-sql-failed";
                error = $"{ex.GetType().Name}: {ex.Message}";
            }

            var afterExists = await TableExistsAsync(table);
            report.Add(new
            {
                table,
                status = afterExists ? "ok" : "still-missing",
                action,
                error,
                note = afterExists
                    ? "Table now exists."
                    : "Heal ran but table is still missing — check DB user permissions (CREATE TABLE may be denied)."
            });
        }

        return Ok(new
        {
            executedAt = DateTime.UtcNow,
            report
        });
    }

    private async Task<bool> TableExistsAsync(string table)
    {
        try
        {
            var connection = _context.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
                await connection.OpenAsync();
            using var cmd = connection.CreateCommand();
            cmd.CommandText =
                $"SELECT CAST(CASE WHEN OBJECT_ID(N'[dbo].[{table}]', N'U') IS NULL THEN 0 ELSE 1 END AS BIT)";
            var result = await cmd.ExecuteScalarAsync();
            return result is bool b && b;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Inline copy of the RouteRuns table + index DDL — same as the
    /// constant in Program.cs. Duplicated here intentionally so the
    /// heal endpoint has zero dependency on internals: just hit it.
    /// </summary>
    private const string RouteRunsCreateSql = @"
IF OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RouteRuns] (
        [Id]                INT             IDENTITY(1,1) NOT NULL,
        [DriverId]          NVARCHAR(450)   NOT NULL,
        [DriverName]        NVARCHAR(256)   NOT NULL,
        [AreaId]            NVARCHAR(50)    NOT NULL,
        [TrashType]         NVARCHAR(MAX)   NOT NULL,
        [TruckId]           INT             NULL,
        [StartedAt]         DATETIME2       NOT NULL,
        [CompletedAt]       DATETIME2       NULL,
        [Status]            NVARCHAR(MAX)   NOT NULL,
        [PlannedDistanceKm] FLOAT           NOT NULL,
        [PlannedMinutes]    FLOAT           NOT NULL,
        [CollectedLoad]     FLOAT           NOT NULL,
        [StopsCompleted]    INT             NOT NULL,
        [StopsPlanned]      INT             NOT NULL,
        [StopsJson]         NVARCHAR(MAX)   NULL,
        CONSTRAINT [PK_RouteRuns] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_RouteRuns_Areas_AreaId]   FOREIGN KEY ([AreaId])
            REFERENCES [dbo].[Areas]  ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_RouteRuns_Trucks_TruckId] FOREIGN KEY ([TruckId])
            REFERENCES [dbo].[Trucks] ([Id]) ON DELETE SET NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Area_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Area_StartedAt]
        ON [dbo].[RouteRuns] ([AreaId] ASC, [StartedAt] ASC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Driver_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Driver_StartedAt]
        ON [dbo].[RouteRuns] ([DriverId] ASC, [StartedAt] ASC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_StartedAt]
        ON [dbo].[RouteRuns] ([StartedAt] ASC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Status' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Status]
        ON [dbo].[RouteRuns] ([Status] ASC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_TruckId' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_TruckId]
        ON [dbo].[RouteRuns] ([TruckId] ASC);
";
    #endregion
}