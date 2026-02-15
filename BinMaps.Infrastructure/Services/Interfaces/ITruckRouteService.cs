using BinMaps.Data.Entities.Enums;
using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface ITruckRouteService
    {
        Task<RouteResultDto> GenerateRouteAsync(int truckId, TrashType? overrideType = null);
    }
}
