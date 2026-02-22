using BinMaps.Data.Entities.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace BinMaps.Data.Entities
{
    public sealed class Report
    {
        [Key]
        public int Id { get; set; }

        [ForeignKey(nameof(TrashContainer))]
        public int? TrashContainerId { get; set; }
        public TrashContainer? TrashContainer { get; set; }

        [Required]
        [MaxLength(450)]
        public string UserId { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string UserName { get; set; } = string.Empty;

        [Required]
        public ReportType ReportType { get; set; }

        [MaxLength(500)]
        public string? Description { get; set; }

        [Range(0, 100)]
        public double AI_Score { get; set; }

        [Range(0, int.MaxValue)]
        public int UserReputationOnSubmit { get; set; }

        public bool IsApproved { get; set; } 

        [Range(0, 100)]
        public double FinalConfidence { get; set; }

        [MaxLength(500)]
        public string? PhotoURL { get; set; }

        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? ReviewedAt { get; set; }

        [MaxLength(450)]
        public string? ReviewedByUserId { get; set; }
    }
}
