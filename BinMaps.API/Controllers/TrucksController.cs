using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
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
        public async Task<ActionResult<RouteResultDto>> GetTruckRoute(int truckId)
        {
            try
            {
                var result = await _truckRouteService.GenerateRouteAsync(truckId);

                if (result == null || result.Route.Count == 0)
                {
                    return Ok(new RouteResultDto
                    {
                        Route = new List<TrashContainerRouteDto>(),
                        Message = "Няма контейнери за събиране"
                    });
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("route-by-area/{areaId}/{trashType}")]
        public async Task<ActionResult<RouteResultDto>> GetRouteByArea(string areaId, TrashType trashType)
        {
            try
            {
                var trucks = await _truckRepo.GetAllAsync();
                var truck = trucks.FirstOrDefault(t => t.AreaId == areaId);

                if (truck == null)
                {
                    return NotFound(new { message = $"No truck found for area: {areaId}" });
                }

                var result = await _truckRouteService.GenerateRouteAsync(truck.Id, trashType);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}