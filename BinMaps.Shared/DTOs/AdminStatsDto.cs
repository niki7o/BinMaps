using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class AdminStatsDTO
    {
        public int TotalContainers { get; set; }
        public int CriticalContainers { get; set; }
        public int TotalUsers { get; set; }
        public int PendingReports { get; set; }
        public int ApprovedReports { get; set; }
        public int RejectedReports { get; set; }
        public double AverageFillPercent { get; set; }
    }
}
