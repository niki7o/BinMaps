using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{

    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly IRepository<Report, int> _reportRepo;

        public AdminController(IRepository<Report, int> reportRepo)
        {
            _reportRepo = reportRepo;
        }

        [HttpGet("reports")]
        public async Task<IActionResult> GetReports()
        {
            var reports = await _reportRepo.GetAllAsync();
            return Ok(reports.OrderByDescending(r => r.FinalConfidence));
        }
    }

}
