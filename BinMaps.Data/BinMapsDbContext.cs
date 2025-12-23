
using BinMaps.Data.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Reflection.Emit;
using System.Text;
using System.Threading.Tasks;
namespace BinMaps.Data
{
    public class BinMapsDbContext : DbContext
    {
        public BinMapsDbContext(DbContextOptions<BinMapsDbContext> options)
         : base(options)
        {
        }

        public DbSet<Area> Areas { get; set; }
        public DbSet<TrashContainer> TrashContainers { get; set; }
        public DbSet<Truck> Trucks { get; set; }
        public DbSet<Report> Reports { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            
                modelBuilder.Entity<TrashContainer>()
                    .Property(tc => tc.Status)
                    .HasConversion<string>();

            modelBuilder.Entity<Report>()
                .Property(r => r.ReportType)
                .HasConversion<string>();
        }
    }
}

