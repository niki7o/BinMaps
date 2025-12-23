using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class Area
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; }

        [MaxLength(500)]
        public string Description { get; set; }

        public ICollection<TrashContainer> TrashContainers { get; set; }
        public ICollection<Truck> Trucks { get; set; }
    }
}
