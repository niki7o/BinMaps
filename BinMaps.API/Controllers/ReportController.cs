using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/reports")]
    public class ReportController : ControllerBase
    {
        private readonly IReportService _reportService;
        private readonly IRepository<Report, int> _reportRepo;

        public ReportController(IReportService reportService, IRepository<Report, int> reportRepo)
        {
            _reportService = reportService;
            _reportRepo = reportRepo;
        }

        [HttpPost]
        [Authorize]
        public async Task<IActionResult> Create([FromForm] CreateReportDTO dto)
        {
            try
            {
                var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                var userNameClaim = User.Identity?.Name ?? User.FindFirstValue(ClaimTypes.Name);
                var roleClaim = User.FindFirstValue(ClaimTypes.Role);

                if (string.IsNullOrEmpty(userIdClaim))
                {
                    return Unauthorized(new { error = "User not authenticated" });
                }

                Console.WriteLine($"Creating report - UserId: {userIdClaim}, UserName: {userNameClaim}, Role: {roleClaim}");
                Console.WriteLine($"Report Type: {dto.ReportType}, ContainerId: {dto.TrashContainerId}");

                var id = await _reportService.CreateAsync(
                    dto,
                    userIdClaim,
                    userNameClaim ?? "Unknown",
                    roleClaim ?? "User"
                );

                return Ok(new { id, message = "Репортът е изпратен успешно" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating report: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");

               
                return StatusCode(500, new { error = $"Грешка при създаване на доклад: {ex.Message}" });
            }
        }

        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var reports = await _reportRepo.GetAllAsync();
                return Ok(reports.OrderByDescending(r => r.CreatedAt));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        [Authorize]
        public async Task<IActionResult> GetById(int id)
        {
            try
            {
                var report = await _reportRepo.GetByIdAsync(id);
                if (report == null)
                    return NotFound(new { error = "Докладът не е намерен" });

                return Ok(report);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}