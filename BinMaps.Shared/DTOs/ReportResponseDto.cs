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
        /// <summary>True when the AI recognised a bin in the photo (or no photo was submitted).</summary>
        public bool ContainerDetected { get; set; } = true;
    }
}
