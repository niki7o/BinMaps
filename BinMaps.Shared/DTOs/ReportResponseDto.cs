using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class ReportResponseDto
    {
        public int ReportId { get; set; }
        public double FinalConfidence { get; set; }
        public bool? IsApproved { get; set; }
        public double AiScore { get; set; }
        public string AiDetectedClass { get; set; } = string.Empty;
        public int UserReputation { get; set; }
        public string Message { get; set; } = string.Empty;
        public bool ContainerDetected { get; set; } = true;
    }
}
