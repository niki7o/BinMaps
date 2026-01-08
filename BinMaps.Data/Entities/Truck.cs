using BinMaps.Data.Entities.Enums;
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
        public string AreaId { get; set; }
        public Area Area { get; set; }


        [Required]
        [Range(0, double.MaxValue)]
        public double Capacity { get; set; }

        [Required]
        public TrashType TrashType { get; set; }

        public double LocationX { get; set; }
        public double LocationY { get; set; }
    }
}
