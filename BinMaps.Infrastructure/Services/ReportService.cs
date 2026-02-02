using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services.Interfaces;
using BinMaps.Shared.DTOs;
using Microsoft.AspNetCore.Identity;

namespace BinMaps.Infrastructure.Services
{
    public class ReportService : IReportService
    {
        private readonly IRepository<Report, int> _reportRepo;
        private readonly IAIService _aiService;
        private readonly UserManager<User> _userManager; 

        public ReportService(IRepository<Report, int> reportRepo, IAIService aiService, UserManager<User> userManager)
        {
            _reportRepo = reportRepo;
            _aiService = aiService;
            _userManager = userManager;
        }

        public async Task<int> CreateAsync(CreateReportDTO dto, string userId, string userName, string role)
        {
            ValidateRole(dto.ReportType, role);

            var user = await _userManager.FindByIdAsync(userId);
            var reputation = user?.Reputation ?? 50;

            AIResultDto? aiResult = null;
            if (dto.Photo != null)
            {
                aiResult = await _aiService.AnalyzeAsync(dto.Photo);
            }

            var finalConfidence = CalculateFinalConfidence(aiResult, reputation);

            var report = new Report
            {
                TrashContainerId = dto.TrashContainerId,
                UserId = userId,
                UserName = userName,
                ReportType = dto.ReportType,
                AI_Score = aiResult?.Confidence ?? 0,
                UserReputationOnSubmit = reputation,
                FinalConfidence = finalConfidence,
                IsApproved = finalConfidence >= 80 || dto.ReportType == ReportType.Fire
            };

            await _reportRepo.AddAsync(report);
            return report.Id;
        }

        public async Task ApproveAsync(int reportId)
        {
            var report = await _reportRepo.GetByIdAsync(reportId);
            if (report != null)
            {
                report.IsApproved = true;
                await _reportRepo.UpdateAsync(report);

                var user = await _userManager.FindByIdAsync(report.UserId);
                if (user != null)
                {
                    user.Reputation = Math.Clamp(user.Reputation + 10, 0, 100);
                    await _userManager.UpdateAsync(user);
                }
            }
        }

        public async Task RejectAsync(int reportId)
        {
            var report = await _reportRepo.GetByIdAsync(reportId);
            if (report != null)
            {
                report.IsApproved = false;
                await _reportRepo.UpdateAsync(report);

                var user = await _userManager.FindByIdAsync(report.UserId);
                if (user != null)
                {
                    user.Reputation = Math.Clamp(user.Reputation - 5, 0, 100);
                    await _userManager.UpdateAsync(user);
                }
            }
        }

        private void ValidateRole(ReportType type, string role)
        {
            if (role != "Driver" && role != "Admin" &&
               (type == ReportType.TruckProblem || type == ReportType.ContainerDamage))
                throw new UnauthorizedAccessException("Нямаш право за този тип доклад.");
        }

        private double CalculateFinalConfidence(AIResultDto? ai, int reputation)
        {
            if (ai == null) return reputation * 0.4;
            return (ai.Confidence * 0.6) + (reputation * 0.4);
        }
    }
}