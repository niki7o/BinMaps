using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    
        [ApiController]
        [Route("api/admin")]
        [Authorize(Roles = "Admin")]
        public class AdminControllerBase : ControllerBase
        {

            [HttpGet("dashboard")]
            public IActionResult GetDashboard()
            {
                return Ok("Welcome to the Admin Dashboard");
            }


        }
    
}
