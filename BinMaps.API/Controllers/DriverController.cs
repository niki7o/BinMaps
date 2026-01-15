using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    

        [ApiController]
        [Route("api/driver")]
        [Authorize(Roles = "Driver")]
        public class DriverControllerBase : ControllerBase
        {
            [HttpGet("simulation")]
            public IActionResult GetSimulation()
            {
                return Ok("Welcome to the Driver Simulation");
            }

       }
    
}
