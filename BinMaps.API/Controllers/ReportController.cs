using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs; 
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace BinMaps.API.Controllers
{

    [ApiController]
    [Route("api/reports")]
    [AllowAnonymous]//temporary for the testing
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;
        private readonly IRepository<Report, int> _reportRepo;
        public ReportsController(IReportService reportService,IRepository<Report, int> reportRepo)
        {
            _reportService = reportService;
            _reportRepo = reportRepo;
        }
        [HttpPost]
        public async Task<IActionResult> Create([FromForm] CreateReportDTO dto)
        {
    
            var userIdClaim = User.FindFirst("id")?.Value;
            var userNameClaim = User.Identity?.Name;
            var roleClaim = User.FindFirst("role")?.Value;

            if (string.IsNullOrEmpty(userIdClaim))
            {
          
                userIdClaim = "test-user-id";   // временно за тестове
                userNameClaim = "TestUser";
                roleClaim = "User";
            }

            var id = await _reportService.CreateAsync(dto, userIdClaim, userNameClaim ?? "Unknown", roleClaim ?? "User");
            return Ok(new { id, message = "Репортът е изпратен успешно" });
        }
    }
}
