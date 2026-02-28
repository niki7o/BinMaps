using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace BinMaps.Data.Entities
{
    public sealed class Report
    {
        #region Identity

        [Key]
        public int Id { get; set; }

        #endregion

        #region Relations

        [Required]
        public string UserId { get; set; } = string.Empty;

        [Required]
        [MaxLength(256)]
        public string UserName { get; set; } = string.Empty;

        [ForeignKey(nameof(TrashContainer))]
        public int? TrashContainerId { get; set; }
        public TrashContainer? TrashContainer { get; set; }

        #endregion

        #region Classification

        [Required]
        public ReportType ReportType { get; set; }

        [MaxLength(500)]
        public string? Description { get; set; }

        [MaxLength(500)]
        public string? PhotoURL { get; set; }

        #endregion

        #region Scoring

        [Range(0.0, 100.0)]
        public double AI_Score { get; set; }

        public int UserReputationOnSubmit { get; set; }

        [Range(0, 100)]
        public double FinalConfidence { get; set; }

        #endregion

        #region Status

        public bool IsApproved { get; set; }

        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        #endregion
    }
}
