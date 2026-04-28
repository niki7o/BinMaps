using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Text.Json;

namespace BinMaps.API.Seed
{
    public sealed class InitialStateSeeder
    {
        private readonly BinMapsDbContext _context;
        private readonly UserManager<User> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;
        private readonly Random _random;
        private readonly IConfiguration _config;

        public InitialStateSeeder(
            BinMapsDbContext context,
            UserManager<User> userManager,
            RoleManager<IdentityRole> roleManager,
            Random random,
            IConfiguration config)
        {
            _context = context;
            _userManager = userManager;
            _roleManager = roleManager;
            _random = random;
            _config = config;
        }

        private bool UseClusterGenerator =>
            _config.GetValue("Seed:UseClusterGenerator", defaultValue: true);

        public async Task SeedAllAsync()
        {
            await SeedRolesAsync();
            await SeedAreasAsync();
            await SeedTrucksAsync();
            await SeedContainersAsync();
            await SeedUsersAsync();
        }

        #region Roles

        private async Task SeedRolesAsync()
        {
            foreach (var role in new[] { "Admin", "Driver", "User" })
            {
                if (!await _roleManager.RoleExistsAsync(role))
                    await _roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        #endregion

        #region Areas

        private async Task SeedAreasAsync()
        {
            if (await _context.Areas.AnyAsync())
                return;

            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "areas.json");
            if (!File.Exists(jsonPath))
                return;

            var json = await File.ReadAllTextAsync(jsonPath);

            var data = JsonSerializer.Deserialize<AreasJsonData>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data?.Areas == null)
                return;

            await _context.Areas.AddRangeAsync(
                data.Areas.Select(a => new Area
                {
                    Id = a.Id,
                    Name = a.Name,
                    Description = a.Description,
                    ZoneMultiplier = a.ZoneMultiplier,
                    RiskLevel = a.RiskLevel,
                    Color = a.Color
                })
            );

            await _context.SaveChangesAsync();
        }

        #endregion

        #region Trucks

        private async Task SeedTrucksAsync()
        {
            if (await _context.Trucks.AnyAsync())
                return;

            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "trucks.json");
            if (!File.Exists(jsonPath))
                return;

            var json = await File.ReadAllTextAsync(jsonPath);

            var data = JsonSerializer.Deserialize<TrucksJsonData>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data?.Trucks == null || data.Trucks.Count == 0)
                return;

            var trucks = data.Trucks.Select(t => new Truck
            {
                
                AreaId = t.AreaId,
                Capacity = t.Capacity,
                LocationX = t.LocationX,
                LocationY = t.LocationY,
                TrashType = (TrashType)t.TrashType,
                IsActive = true,
                LicensePlate = GenerateLicensePlate(new HashSet<string>())
            });

            await _context.Trucks.AddRangeAsync(trucks);
            await _context.SaveChangesAsync();
        }

        private string GenerateLicensePlate(HashSet<string> existing)
        {
            string plate;
            do { plate = $"СО{_random.Next(1000, 9999)}АА"; }
            while (existing.Contains(plate));
            return plate;
        }

        #endregion

        #region Containers

        private async Task SeedContainersAsync()
        {
            // First-time seed: table is empty → insert everything.
            // Subsequent runs: backfill any seeded row whose Id was hard-deleted
            // (admin "permanent delete" can wipe a seeded container; this lets
            // it self-heal on the next startup without losing user data).
            bool tableIsEmpty = !await _context.TrashContainers.AnyAsync();

            IReadOnlyList<TrashContainer> seedSet = UseClusterGenerator
                ? await GenerateContainersFromClustersAsync()
                : await LoadContainersFromJsonAsync();

            if (seedSet.Count == 0) return;

            if (tableIsEmpty)
            {
                await _context.TrashContainers.AddRangeAsync(seedSet);
                await _context.SaveChangesAsync();
                return;
            }

            // Backfill missing seeded rows. We compare against the FULL table
            // including soft-deleted, so a soft-deleted seed bin isn't reinserted.
            var existingIds = await _context.TrashContainers
                .IgnoreQueryFilters()
                .Select(c => c.Id)
                .ToHashSetAsync();

            var missing = seedSet.Where(c => !existingIds.Contains(c.Id)).ToList();
            if (missing.Count == 0) return;

            await _context.TrashContainers.AddRangeAsync(missing);
            await _context.SaveChangesAsync();
        }

        /// <summary>
        /// Cluster-based generator: each collection point holds one bin per
        /// <see cref="TrashType"/> placed side-by-side. Produces ~480 bins
        /// across six zones so truck routes always have meaningful targets,
        /// and the map renders like a real разделно събиране layout.
        /// </summary>
        private async Task<IReadOnlyList<TrashContainer>> GenerateContainersFromClustersAsync()
        {
            var areas = await _context.Areas.AsNoTracking().ToListAsync();
            if (areas.Count == 0) return Array.Empty<TrashContainer>();

            var generator = new ContainerClusterGenerator(_random);
            var bins = generator.Generate(areas);

            var now = DateTime.UtcNow;
            var ambient = GetAmbientTemperature();

            // Generator leaves Temperature null; set it here for sensor-backed
            // bins so the initial map view has values to render (the
            // FillageSimulator will take over from the next cycle onwards).
            foreach (var bin in bins.Where(b => b.HasSensor))
                bin.Temperature = CalculateInitialTemperature(ambient, bin.TrashType, bin.FillPercentage, now.Hour);

            return bins;
        }

        private async Task<IReadOnlyList<TrashContainer>> LoadContainersFromJsonAsync()
        {
            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "containers.json");
            if (!File.Exists(jsonPath)) return Array.Empty<TrashContainer>();

            var json = await File.ReadAllTextAsync(jsonPath);
            var data = JsonSerializer.Deserialize<ContainersJsonData>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data?.Containers == null || data.Containers.Count == 0)
                return Array.Empty<TrashContainer>();

            var now = DateTime.UtcNow;
            var ambient = GetAmbientTemperature();

            return data.Containers.Select(c =>
            {
                var type = (TrashType)c.TrashType;
                var fill = CalculateInitialFill(c.AreaId, type, now.Hour, now.DayOfWeek);
                return new TrashContainer
                {
                    Id = c.Id,
                    AreaId = c.AreaId,
                    TrashType = type,
                    Capacity = c.Capacity,
                    FillPercentage = fill,
                    LocationX = c.LocationX,
                    LocationY = c.LocationY,
                    HasSensor = c.HasSensor,
                    Status = TrashContainerStatus.Active,
                    Temperature = c.HasSensor ? CalculateInitialTemperature(ambient, type, fill, now.Hour) : null,
                    BatteryPercentage = c.HasSensor ? _random.Next(60, 101) : null,
                    LastSensorReadAt = c.HasSensor ? now : null,
                    IsSeeded = true
                };
            }).ToList();
        }

        private double CalculateInitialFill(string areaId, TrashType type, int hour, DayOfWeek day)
        {
            var area = _context.Areas.FirstOrDefault(a => a.Id == areaId);

            var baseFill = area?.ZoneMultiplier * 40 ?? 40;

            baseFill += hour switch
            {
                >= 18 and <= 22 => 15,
                >= 0 and <= 6 => -10,
                _ => 0
            };

            baseFill += day switch
            {
                DayOfWeek.Friday or DayOfWeek.Saturday => 10,
                DayOfWeek.Sunday or DayOfWeek.Monday => -5,
                _ => 0
            };

            baseFill *= type switch
            {
                TrashType.Mixed => 1.2,
                TrashType.Plastic => 1.1,
                TrashType.Paper => 1.0,
                TrashType.Glass => 0.8,
                _ => 1.0
            };

            baseFill += _random.Next(-10, 11);

            return Math.Clamp(baseFill, 5, 95);
        }

        private double CalculateInitialTemperature(double ambient, TrashType type, double fill, int hour)
        {
            var temp = ambient;
            if (type == TrashType.Mixed && fill > 40)
                temp += 3 + (fill - 40) * 0.1;
            if (hour >= 10 && hour <= 17)
                temp += _random.Next(5, 12);
            temp += _random.Next(-2, 3);
            return Math.Round(temp, 1);
        }

        private double GetAmbientTemperature()
        {
            var month = DateTime.Now.Month;
            return month switch
            {
                12 or 1 or 2 => 3.0,
                3 or 4 or 5 => 15.0,
                6 or 7 or 8 => 28.0,
                _ => 18.0
            };
        }

        #endregion

        #region Users

        private async Task SeedUsersAsync()
        {
            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "users.json");
            if (!File.Exists(jsonPath)) return;

            var json = await File.ReadAllTextAsync(jsonPath);
            var data = JsonSerializer.Deserialize<UsersJsonData>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data?.Users == null || data.Users.Count == 0) return;

            foreach (var u in data.Users)
            {
                if (await _userManager.FindByNameAsync(u.Username) != null) continue;

                var user = new User
                {
                    UserName = u.Username,
                    Email = u.Email,
                    EmailConfirmed = true
                };

                var result = await _userManager.CreateAsync(user, u.Password);
                if (result.Succeeded)
                    await _userManager.AddToRoleAsync(user, u.Role);
            }
        }

        #endregion

        #region JSON Models

        private sealed class TrucksJsonData
        {
            public List<TruckJsonItem> Trucks { get; set; } = [];
        }

        private sealed class TruckJsonItem
        {
            public int Id { get; set; }
            public string AreaId { get; set; } = string.Empty;
            public double Capacity { get; set; }
            public double LocationX { get; set; }
            public double LocationY { get; set; }
            public int TrashType { get; set; }
        }
        private sealed class AreasJsonData
        {
            public List<AreaJsonItem> Areas { get; set; } = [];
        }

        private sealed class AreaJsonItem
        {
            public string Id { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public double ZoneMultiplier { get; set; } = 1.0;
            public string RiskLevel { get; set; } = "Low";
            public string Color { get; set; } = "#10b981";
        }

        private sealed class UsersJsonData
        {
            public List<UserJsonItem> Users { get; set; } = [];
        }

        private sealed class UserJsonItem
        {
            public string Username { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string Role { get; set; } = string.Empty;
        }

        private sealed class ContainersJsonData
        {
            public List<ContainerJsonItem> Containers { get; set; } = [];
        }

        private sealed class ContainerJsonItem
        {
            public int Id { get; set; }
            public double LocationX { get; set; }
            public double LocationY { get; set; }
            public string AreaId { get; set; } = string.Empty;
            public int TrashType { get; set; }
            public bool HasSensor { get; set; }
            public double Capacity { get; set; }
        }

        #endregion
    }
}