using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IReportService
    {
        Task<ReportResponseDto> CreateAsync(CreateReportDTO dto, string userId, string userName, string role, AIResultDto? precomputedAiResult = null);
        Task ApproveAsync(int reportId);
        Task RejectAsync(int reportId);
    }
}
