
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
namespace BinMaps.Data.Entities
{
    public sealed class User: IdentityUser
    {

        #region Profile

        [Range(0, 100)]
        public int Reputation { get; set; } = 50;

        [MaxLength(500)]
        public string? ProfilePicturePath { get; set; }

        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        #endregion

        #region Navigation

        public ICollection<Report> Reports { get; set; } = new List<Report>();

        #endregion
    }
}
