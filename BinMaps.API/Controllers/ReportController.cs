using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace BinMaps.API.Controllers
{

    [ApiController]
    [Route("api/reports")]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;

        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromForm] CreateReportDto dto)
        {
            var userId = User.FindFirst("id")!.Value;
            var userName = User.Identity!.Name!;
            var role = User.FindFirst("role")!.Value;

            var reportId = await _reportService.CreateAsync(dto, userId, userName, role);

            return Ok(new { reportId });
        }
    }

}
