using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BinMaps.Data;

public sealed class BinMapsDbContext : IdentityDbContext<User>
{
    public BinMapsDbContext(DbContextOptions<BinMapsDbContext> options)
        : base(options)
    {
    }

    #region DbSets

    public DbSet<Area> Areas => Set<Area>();
    public DbSet<TrashContainer> TrashContainers => Set<TrashContainer>();
    public DbSet<Truck> Trucks => Set<Truck>();
    public DbSet<Report> Reports => Set<Report>();

    #endregion

    #region Configuration

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<TrashContainer>(entity =>
        {
            entity.Property(tc => tc.TrashType).HasConversion<string>();
            entity.Property(tc => tc.Status).HasConversion<string>();

            entity.HasOne(tc => tc.Area)
                .WithMany(a => a.TrashContainers)
                .HasForeignKey(tc => tc.AreaId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(tc => new { tc.AreaId, tc.TrashType, tc.Status })
                .HasDatabaseName("IX_Containers_Area_Type_Status");

            entity.HasIndex(tc => new { tc.LocationX, tc.LocationY })
                .HasDatabaseName("IX_Containers_Location");
        });

        builder.Entity<Report>(entity =>
        {
            entity.Property(r => r.ReportType).HasConversion<string>();

            entity.HasOne(r => r.TrashContainer)
                .WithMany(tc => tc.Reports)
                .HasForeignKey(r => r.TrashContainerId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(r => new { r.IsApproved, r.CreatedAt })
                .HasDatabaseName("IX_Reports_Approval_Date");
        });

        builder.Entity<Truck>(entity =>
        {
            entity.Property(t => t.TrashType).HasConversion<string>();

            entity.HasOne(t => t.Area)
                .WithMany(a => a.Trucks)
                .HasForeignKey(t => t.AreaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<User>(entity =>
        {
            entity.HasMany(u => u.Reports)
                .WithOne()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    #endregion
}