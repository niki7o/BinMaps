using BinMaps.Shared.DTOs;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IReportService
    {
        Task<int> CreateAsync(CreateReportDTO dto, string userId, string userName, string role);

        Task ApproveAsync(int reportId, string reviewerUserId);
        Task RejectAsync(int reportId, string reviewerUserId);

    }
}
