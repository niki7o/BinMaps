using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services.Interfaces
{
    public interface IReportService
    {
        Task<int> CreateAsync(CreateReportDto dto, string userId, string userName, string role);
        Task ApproveAsync(int reportId);
        Task RejectAsync(int reportId);

    }
}
