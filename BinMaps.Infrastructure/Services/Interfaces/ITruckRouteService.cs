using BinMaps.Data.Entities.Enums;
using BinMaps.Shared.DTOs;

namespace BinMaps.Infrastructure.Services.Interfaces;

public interface ITruckRouteService
{
    Task<RouteResultDto> GenerateRouteAsync(string areaId, TrashType trashType);
}