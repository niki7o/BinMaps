using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class ContainerStopDTO
    {
        public int Id { get; set; }
        public int StopNumber { get; set; }
        public double FillPercentage { get; set; }
        public double LocationX { get; set; }
        public double LocationY { get; set; }
        public double DistanceFromPreviousKm { get; set; }
        public double EstimatedLoadKg { get; set; }
        public TrashType TrashType { get; set; }
        public TrashContainerStatus Status { get; set; }
    }
}
