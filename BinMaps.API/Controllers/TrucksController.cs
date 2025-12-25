using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TrucksController : ControllerBase
    {
        private readonly ITruckRouteService _truckRouteService;

        public TrucksController(ITruckRouteService truckRouteService)
        {
            _truckRouteService = truckRouteService;
        }

     
        [HttpGet("{truckId}/route")]
        public async Task<ActionResult<IEnumerable<TrashContainerRouteDto>>> GetTruckRoute(int truckId)
        {
            var route = await _truckRouteService.GenerateRouteAsync(truckId);

            if (route == null)
                return NotFound($"Truck with ID {truckId} not found or has no route.");

            return Ok(route);
        }
    }
}
