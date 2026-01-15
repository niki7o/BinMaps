using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Runtime.ConstrainedExecution;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class Report
    {
        [Key]
        public int Id { get; set; }

       
        [ForeignKey(nameof(TrashContainer))]
        public int? TrashContainerId { get; set; }
        public TrashContainer TrashContainer { get; set; }

        [Required]
        public string UserId { get; set; }
        [Required]
        [MaxLength(100)]
        public string UserName { get; set; }

        

        [Required]
        public ReportType ReportType { get; set; }

        [Range(0, 100)]
        public int AI_Score { get; set; }
        public int UserReputationOnSubmit { get; set; }
        public bool IsApproved { get; set; } = false;
         public double FinalConficende { get; set; } 


        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(250)]
        public string PhotoURL { get; set; }
    }
}
