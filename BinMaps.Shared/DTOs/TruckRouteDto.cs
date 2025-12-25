using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class TruckRouteDto
    {
        public int TruckId { get; set; }
        public IEnumerable<TrashContainerRouteDto> Route { get; set; }
        public double TotalDistance { get; set; }
    }
}
