using BinMaps.Data.Entities.Enums;

using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class TrashContainerRouteDto
    {
        public int Id { get; set; }

      
        public string AreaId { get; set; }
        public double Capacity { get; set; }
        public double FillPercentage { get; set; }
        public bool HasSensor { get; set; }
        public double LocationX { get; set; }
        public double LocationY { get; set; }
        public TrashType TrashType { get; set; }
        public TrashContainerStatus Status { get; set; }
        public double Score { get; set; }
    }
}
