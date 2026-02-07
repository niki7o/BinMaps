using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{

    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly IRepository<Report, int> _reportRepo;
        private readonly IRepository<TrashContainer, int> _containerRepo;
        private readonly IRepository<Truck, int> _truckRepo;
        private readonly UserManager<User> _userManager;
        private readonly IReportService _reportService;

        public AdminController(
            IRepository<Report, int> reportRepo,
            IRepository<TrashContainer, int> containerRepo,
            IRepository<Truck, int> truckRepo,
            UserManager<User> userManager,
            IReportService reportService)
        {
            _reportRepo = reportRepo;
            _containerRepo = containerRepo;
            _truckRepo = truckRepo;
            _userManager = userManager;
            _reportService = reportService;
        }

        [HttpGet("reports")]
        public async Task<IActionResult> GetReports()
        {
            var reports = await _reportRepo.GetAllAsync();
            return Ok(reports.OrderByDescending(r => r.CreatedAt));
        }

        [HttpPost("reports/{id}/approve")]
        public async Task<IActionResult> ApproveReport(int id)
        {
            await _reportService.ApproveAsync(id);
            return Ok(new { message = "Репортът е одобрен" });
        }

        [HttpPost("reports/{id}/reject")]
        public async Task<IActionResult> RejectReport(int id)
        {
            await _reportService.RejectAsync(id);
            return Ok(new { message = "Репортът е отхвърлен" });
        }

        [HttpGet("containers")]
        public async Task<IActionResult> GetContainers()
        {
            var containers = await _containerRepo.GetAllAsync();
            return Ok(containers.OrderBy(c => c.AreaId));
        }

        [HttpGet("containers/{id}")]
        public async Task<IActionResult> GetContainer(int id)
        {
            var container = await _containerRepo.GetByIdAsync(id);
            if (container == null) return NotFound();
            return Ok(container);
        }

        [HttpPut("containers/{id}")]
        public async Task<IActionResult> UpdateContainer(int id, [FromBody] UpdateContainerDto dto)
        {
            var container = await _containerRepo.GetByIdAsync(id);
            if (container == null) return NotFound();

            container.FillPercentage = dto.FillPercentage;
            container.Status = dto.Status;
            container.HasSensor = dto.HasSensor;

            await _containerRepo.UpdateAsync(container);
            return Ok(container);
        }

        [HttpGet("trucks")]
        public async Task<IActionResult> GetTrucks()
        {
            var trucks = await _truckRepo.GetAllAsync();
            return Ok(trucks.OrderBy(t => t.AreaId));
        }

        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _userManager.GetUsersInRoleAsync("User");
            var drivers = await _userManager.GetUsersInRoleAsync("Driver");

            var allUsers = users.Concat(drivers)
                .Select(u => new {
                    u.Id,
                    u.UserName,
                    u.Email,
                    Roles = _userManager.GetRolesAsync(u).Result,
                    u.Reputation
                });

            return Ok(allUsers.OrderByDescending(u => u.Reputation));
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var totalReports = (await _reportRepo.GetAllAsync()).Count();
            var pendingReports = (await _reportRepo.GetAllAsync()).Count(r => !r.IsApproved);
            var totalContainers = (await _containerRepo.GetAllAsync()).Count();
            var fullContainers = (await _containerRepo.GetAllAsync()).Count(c => c.FillPercentage > 80);
            var fireReports = (await _reportRepo.GetAllAsync()).Count(r => r.ReportType == ReportType.Fire);

            return Ok(new
            {
                TotalReports = totalReports,
                PendingReports = pendingReports,
                TotalContainers = totalContainers,
                FullContainers = fullContainers,
                FireReports = fireReports
            });
        }
    }

    public class UpdateContainerDto
    {
        public double FillPercentage { get; set; }
        public TrashContainerStatus? Status { get; set; }
        public bool HasSensor { get; set; }
    }

}
