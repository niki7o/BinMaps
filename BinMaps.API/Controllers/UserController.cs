using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/user")]
    [Authorize(Roles ="User")]
    public class UserController : ControllerBase
    {
        [HttpGet("map")]
        public IActionResult GetMap()
        {
            return Ok("Welcome to the User Map");

        }

    }
}
