using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class Report
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [ForeignKey(nameof(TrashContainer))]
        public int TrashContainerId { get; set; }
        public TrashContainer TrashContainer { get; set; }

        [Required]
        [MaxLength(100)]
        public string UserName { get; set; }

        [Required]
        public ReportType ReportType { get; set; }

        [Range(0, 100)]
        public int AI_Score { get; set; }

        public bool IsApproved { get; set; } = false;

        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(250)]
        public string PhotoURL { get; set; }
    }
}
