using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    
    [ApiController]
    [Route("api/[controller]")]
    [Produces("application/json")]
    public class TrucksController : ControllerBase
    {
        #region Private Fields

        private readonly ITruckRouteService _routeService;
        private readonly ILogger<TrucksController> _logger;

        #endregion

        #region Constructor

        public TrucksController(
            ITruckRouteService routeService,
            ILogger<TrucksController> logger)
        {
            _routeService = routeService;
            _logger = logger;
        }

        #endregion

        #region API Endpoints

       
        [HttpGet("route")]
        [Authorize(Roles = "Driver,Admin")]
        [ProducesResponseType(typeof(RouteResultDto), 200)]
        [ProducesResponseType(400)]
        [ProducesResponseType(401)]
        [ProducesResponseType(500)]
        public async Task<ActionResult<RouteResultDto>> GenerateRoute(
            [FromQuery] string areaId,
            [FromQuery] TrashType trashType)
        {
            try
            {
               
                if (string.IsNullOrWhiteSpace(areaId))
                {
                    _logger.LogWarning("GenerateRoute called with empty areaId");
                    return BadRequest(new { error = "Моля изберете зона" });
                }

                _logger.LogInformation(
                    "Generating route for Area: {AreaId}, TrashType: {TrashType}",
                    areaId,
                    trashType);

               
                var result = await _routeService.GenerateRouteAsync(areaId, trashType);

                
                if (result.Route == null || !result.Route.Any())
                {
                    _logger.LogInformation(
                        "No route generated for Area: {AreaId}, TrashType: {TrashType}. Reason: {Message}",
                        areaId,
                        trashType,
                        result.Message);

                    return Ok(result); 
                }

                _logger.LogInformation(
                    "Route generated successfully: {ContainersCount} containers, {Distance} km",
                    result.ContainersCount,
                    result.TotalDistance);

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Error generating route for Area: {AreaId}, TrashType: {TrashType}",
                    areaId,
                    trashType);

                return StatusCode(500, new
                {
                    error = "Грешка при генериране на маршрут",
                    details = ex.Message
                });
            }
        }

        #endregion
    }
}