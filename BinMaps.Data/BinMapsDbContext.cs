using BinMaps.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;


namespace BinMaps.Data
{
    public sealed class BinMapsDbContext : IdentityDbContext<User>
    {
        public BinMapsDbContext(DbContextOptions<BinMapsDbContext> options) : base(options) { }

        #region DbSets

        public DbSet<Area> Areas => Set<Area>();
        public DbSet<TrashContainer> TrashContainers => Set<TrashContainer>();
        public DbSet<Truck> Trucks => Set<Truck>();
        public DbSet<Report> Reports => Set<Report>();

        #endregion

        #region Model Configuration

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.UseCollation("Cyrillic_General_CI_AS");
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<IdentityUserRole<string>>().HasKey(r => new { r.UserId, r.RoleId });

            ConfigureTrashContainer(modelBuilder);
            ConfigureReport(modelBuilder);
            ConfigureTruck(modelBuilder);
            ConfigureUser(modelBuilder);
        }

        #endregion

        #region Entity Configuration Methods

        private static void ConfigureTrashContainer(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<TrashContainer>(entity =>
            {
                entity.Property(tc => tc.Id).ValueGeneratedNever();
                entity.Property(tc => tc.Status).HasConversion<string>();
                entity.Property(tc => tc.TrashType).HasConversion<string>();

                entity.HasOne(tc => tc.Area)
                    .WithMany(a => a.TrashContainers)
                    .HasForeignKey(tc => tc.AreaId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(tc => new { tc.AreaId, tc.TrashType, tc.Status })
                    .HasDatabaseName("IX_Containers_Area_Type_Status");

                entity.HasIndex(tc => new { tc.LocationX, tc.LocationY })
                    .HasDatabaseName("IX_Containers_Location");
            });
        }

        private static void ConfigureReport(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Report>(entity =>
            {
                entity.Property(r => r.ReportType).HasConversion<string>();
                entity.Property(r => r.AI_Score).HasColumnType("float");

                entity.Property(r => r.UserId)
                    .HasMaxLength(450)
                    .IsRequired();

                entity.HasOne(r => r.TrashContainer)
                    .WithMany(tc => tc.Reports)
                    .HasForeignKey(r => r.TrashContainerId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(r => new { r.IsApproved, r.CreatedAt })
                    .HasDatabaseName("IX_Reports_Approval_Date");

                entity.HasIndex(r => r.UserId)
                    .HasDatabaseName("IX_Reports_UserId");
            });
        }

        private static void ConfigureTruck(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Truck>(entity =>
            {
                entity.Property(t => t.TrashType).HasConversion<string>();

                entity.HasOne(t => t.Area)
                    .WithMany(a => a.Trucks)
                    .HasForeignKey(t => t.AreaId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(t => t.AreaId)
                    .HasDatabaseName("IX_Trucks_AreaId");
            });
        }

        private static void ConfigureUser(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasMany(u => u.Reports)
                    .WithOne()
                    .HasForeignKey(r => r.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }

        #endregion
    }
}
