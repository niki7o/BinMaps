using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class AIResultDto
    {
        public double FillPercentage { get; set; }
        public bool FireDetected { get; set; }
        public int Confidence { get; set; }
    }
}
