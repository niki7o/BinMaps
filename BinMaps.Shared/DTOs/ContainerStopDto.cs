using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class ContainerStopDto
    {
        public int Id { get; set; }
        public int StopNumber { get; set; }
        public double FillPercentage { get; set; }
        public double LocationX { get; set; }
        public double LocationY { get; set; }
        public double DistanceFromPrevious { get; set; }
        public double EstimatedLoad { get; set; }
        public TrashType TrashType { get; set; }
        public TrashContainerStatus Status { get; set; }
    }
}
