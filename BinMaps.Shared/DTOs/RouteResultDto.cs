using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class RouteResultDto
    {
        public int TruckId { get; set; }
        public string AreaId { get; set; } = string.Empty;
        public TrashType TrashType { get; set; }

        public List<TrashContainerRouteDto> Route { get; set; } = new();

        public double TotalDistance { get; set; }
        public double TotalLoad { get; set; }

        public double TruckCapacity { get; set; }
        public double CapacityUtilization { get; set; }

        public int ContainersCount { get; set; }
        public double EstimatedTimeMinutes { get; set; }

     

        public string Message { get; set; } = string.Empty;
    }
}
