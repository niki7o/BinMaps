using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace BinMaps.Data.Entities
{
    public sealed class Truck
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [ForeignKey(nameof(Area))]
        [MaxLength(50)]
        public string AreaId { get; set; } = string.Empty;
        public Area Area { get; set; } = null!;

        [Required]
        [Range(1_000, 30_000)]
        public double Capacity { get; set; }

        [Required]
        [Range(-90, 90)]
        public double LocationX { get; set; }

        [Required]
        [Range(-180, 180)]
        public double LocationY { get; set; }

        [Required]
        [MaxLength(20)]
        public string LicensePlate { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;
    }
}
