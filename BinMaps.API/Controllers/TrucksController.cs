using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
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
        private readonly IRepository<Truck, int> _truckRepo;

        public TrucksController(
            ITruckRouteService truckRouteService,
            IRepository<Truck, int> truckRepo)
        {
            _truckRouteService = truckRouteService;
            _truckRepo = truckRepo;
        }

        [HttpGet("{truckId}/route")]
        public async Task<ActionResult<IEnumerable<TrashContainerRouteDto>>> GetTruckRoute(int truckId)
        {
            var route = await _truckRouteService.GenerateRouteAsync(truckId);
            return Ok(route);
        }

        [HttpGet("route-by-area/{areaId}/{trashType}")]
        public async Task<ActionResult<IEnumerable<TrashContainerRouteDto>>> GetRouteByArea(string areaId, TrashType trashType)
        {
            var trucks = await _truckRepo.GetAllAsync();
            var truck = trucks.FirstOrDefault(t => t.AreaId == areaId);

            if (truck == null)
            {
                return NotFound(new { message = $"No truck found for area: {areaId}" });
            }

            var route = await _truckRouteService.GenerateRouteAsync(truck.Id, trashType);
            return Ok(route);
        }
    }
}