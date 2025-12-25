using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface ITruckRouteService
    {
        Task<IEnumerable<TrashContainerRouteDto>> GenerateRouteAsync(int truckId);
    }
}
