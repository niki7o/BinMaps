using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/containers")]
    public class TrashContainersController : Controller
    {
        private readonly IRepository<TrashContainer, int> _repo;

        public TrashContainersController(IRepository<TrashContainer, int> repo)
        {
            _repo = repo;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var containers = await _repo.GetAllAsync();

            return Ok(containers.Select(c => new
            {
                c.Id,

                c.LocationX,
                c.LocationY,
                c.TrashType,
                c.HasSensor,
                c.FillPercentage,
                c.Status,
                c.AreaId
            }));
        }
    }
}
