using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class Truck
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [ForeignKey(nameof(Area))]
        public int AreaId { get; set; }
        public Area Area { get; set; }

        [Required]
        [MaxLength(100)]
        public string DriverName { get; set; } 

        [Required]
        [Range(0, double.MaxValue)]
        public double Capacity { get; set; }


    }
}
