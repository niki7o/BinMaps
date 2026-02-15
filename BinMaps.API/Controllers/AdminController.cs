using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.ComponentModel;

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
        private readonly IServiceProvider _serviceProvider;


        public AdminController(
            IRepository<Report, int> reportRepo,
            IRepository<TrashContainer, int> containerRepo,
            IRepository<Truck, int> truckRepo,
            UserManager<User> userManager,
            IReportService reportService,
            
            IServiceProvider serviceProvider)
        {
            _reportRepo = reportRepo;
            _containerRepo = containerRepo;
            _truckRepo = truckRepo;
            _userManager = userManager;
            _reportService = reportService;
            _serviceProvider = serviceProvider;
        }

        #region Reports
        [HttpGet("reports")]
        public async Task<IActionResult> GetReports()
        {
            var reports = await _reportRepo.GetAllAsync();
            return Ok(reports.OrderByDescending(r => r.CreatedAt));
        }
        #endregion


        [HttpPost("reports/{id}/approve")]
        public async Task<IActionResult> ApproveReport(int id)
        {
            var report = await _reportRepo.GetByIdAsync(id);
            if (report == null)
                return NotFound();

         
            await _reportService.ApproveAsync(id);

            
            if (report.TrashContainerId.HasValue)
            {
                var reportTypeMap = new Dictionary<ReportType, string>
        {
            { ReportType.Full, "Full" },
            { ReportType.Fire, "Fire" },
            { ReportType.SensorBroken, "SensorBroken" },
            { ReportType.ContainerDamage, "ContainerDamage" }
        };

                var reportTypeString = reportTypeMap.GetValueOrDefault(report.ReportType, "Full");

               
                var containerRepo = _serviceProvider.GetRequiredService<IRepository<TrashContainer, int>>();
                var container = await containerRepo.GetByIdAsync(report.TrashContainerId.Value);

                if (container != null)
                {
                    switch (report.ReportType)
                    {
                        case ReportType.Full:
                            container.FillPercentage = Math.Max(container.FillPercentage, 90);
                            break;
                        case ReportType.Fire:
                            container.Status = TrashContainerStatus.Fire;
                            if (container.HasSensor) container.Temperature = 60;
                            break;
                        case ReportType.SensorBroken:
                            container.HasSensor = false;
                            container.Temperature = null;
                            break;
                        case ReportType.ContainerDamage:
                            container.Status = TrashContainerStatus.Offline;
                            break;
                    }

                    await containerRepo.UpdateAsync(container);
                }
            }

            return Ok(new { message = "Репортът е одобрен и контейнерът е актуализиран" });
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
