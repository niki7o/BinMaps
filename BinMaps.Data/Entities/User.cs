
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
namespace BinMaps.Data.Entities
{
    public sealed class User: IdentityUser
    {

        [Range(0, int.MaxValue)]
        public int Reputation { get; set; } = 50;

        [MaxLength(500)]
        public string? ProfilePicturePath { get; set; }

        public bool IsBanned { get; set; } = false;

        [MaxLength(200)]
        public string? BanReason { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? LastLoginAt { get; set; }

        public ICollection<Report> Reports { get; set; } = new List<Report>();
    }
}
