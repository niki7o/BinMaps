using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class AdminReportFilterDto
    {
        public bool? IsApproved { get; set; }
        public string? ReportType { get; set; }
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public string? AreaId { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 20;
    }
}
