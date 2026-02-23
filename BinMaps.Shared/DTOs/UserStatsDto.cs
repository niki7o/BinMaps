using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class UserStatsDto
    {
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public int Reputation { get; set; }
        public string ReputationLevel { get; set; } = string.Empty;
        public int TotalReports { get; set; }
        public int ApprovedReports { get; set; }
        public int PendingReports { get; set; }
        public int RejectedReports { get; set; }
    }
}
