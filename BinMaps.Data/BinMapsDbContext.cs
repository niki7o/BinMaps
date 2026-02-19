using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Data
{
    public class BinMapsDbContext : IdentityDbContext<User>
    {
        public BinMapsDbContext(DbContextOptions<BinMapsDbContext> options)
         : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<IdentityRole> Roles { get; set; }
        public DbSet<IdentityUserRole<string>> UserRoles { get; set; }
        public DbSet<Area> Areas { get; set; }
        public DbSet<TrashContainer> TrashContainers { get; set; }
        public DbSet<Truck> Trucks { get; set; }
        public DbSet<Report> Reports { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.UseCollation("Cyrillic_General_CI_AS");

            modelBuilder.Entity<IdentityUserRole<string>>().HasKey(r => new { r.UserId, r.RoleId });
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<TrashContainer>()
                    .Property(tc => tc.Id)
                    .ValueGeneratedNever();

            modelBuilder.Entity<TrashContainer>()
                .Property(tc => tc.Status)
                .HasConversion<string>();

            modelBuilder.Entity<Report>()
                .Property(r => r.ReportType)
                .HasConversion<string>();
        }
    }
}