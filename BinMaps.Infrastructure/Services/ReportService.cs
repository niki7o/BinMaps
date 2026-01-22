using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Infrastructure.Services
{
    public class ReportService : IReportService
    {
        private readonly IRepository<Report, int> _reportRepo;
        private readonly IAIService _aiService;

        public ReportService(
            IRepository<Report, int> reportRepo,
            IAIService aiService)
        {
            _reportRepo = reportRepo;
            _aiService = aiService;
        }

        public async Task<int> CreateAsync(
            CreateReportDto dto,
            string userId,
            string userName,
            string role)
        {
            ValidateRole(dto.ReportType, role);

            AIResultDto? aiResult = null;

            if (dto.Photo != null)
                aiResult = await _aiService.AnalyzeAsync(dto.Photo);

            var reputation = 50; // seed value, без user таблица

            var finalConfidence = CalculateFinalConfidence(aiResult, reputation);

            var report = new Report
            {
                TrashContainerId = dto.TrashContainerId,
                UserId = userId,
                UserName = userName,
                ReportType = dto.ReportType,
                AI_Score = aiResult?.Confidence ?? 0,
                UserReputationOnSubmit = reputation,
                FinalConficende = finalConfidence,
                IsApproved = finalConfidence >= 80
            };

            await _reportRepo.AddAsync(report);
            return report.Id;
        }

        public async Task ApproveAsync(int reportId)
        {
            var report = await _reportRepo.GetByIdAsync(reportId);
            report.IsApproved = true;
            await _reportRepo.UpdateAsync(report);
        }

        public async Task RejectAsync(int reportId)
        {
            var report = await _reportRepo.GetByIdAsync(reportId);
            report.IsApproved = false;
            await _reportRepo.UpdateAsync(report);
        }

        private void ValidateRole(ReportType type, string role)
        {
            if (role != "Driver" &&
                (type == ReportType.TruckProblem || type == ReportType.ContainerDamage))
                throw new UnauthorizedAccessException("Нямаш право за този тип доклад.");
        }

        private double CalculateFinalConfidence(AIResultDto? ai, int reputation)
        {
            if (ai == null)
                return reputation * 0.4;

            return ai.Confidence * 0.6 + reputation * 0.4;
        }
    }
}
