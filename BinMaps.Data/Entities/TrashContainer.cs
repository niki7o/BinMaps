using BinMaps.Data.Entities.Enums;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class TrashContainer
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [ForeignKey(nameof(Area))]
        public int AreaId { get; set; }
        public Area Area { get; set; }

        [Required]
        [Range(0, double.MaxValue)]
        public double Capacity { get; set; }
        [Required]
        public TrashType TrashTypе { get; set; }
        [Required]
        [Range(0, 100)]
        public double FillPercentage { get; set; }

        [Required]
        public double Temperature { get; set; }

        [Required]
        [Range(0, 100)]
        public double BatteryPercentage { get; set; }

        [Required]
        public TrashContainerStatus Status { get; set; }

        [Required]
        public double LocationX { get; set; }

        [Required]
        public double LocationY { get; set; }

        public ICollection<Report> Reports { get; set; }


    }

}
