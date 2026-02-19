using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BinMaps.API.Seed
{
    public class InitialStateSeeder
    {
        private readonly BinMapsDbContext _context;
        private readonly UserManager<User> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;
        private readonly Random _random = new();

        public InitialStateSeeder(
            BinMapsDbContext context,
            UserManager<User> userManager,
            RoleManager<IdentityRole> roleManager)
        {
            _context = context;
            _userManager = userManager;
            _roleManager = roleManager;
        }

        public async Task SeedAllAsync()
        {
            await SeedRoles();
            await SeedAreas();
            await SeedUsersFromJson();
            await SeedTrucksFromJson();
            await SeedContainersFromJson();
        }

        private async Task SeedRoles()
        {
            string[] roles = { "Admin", "Driver", "User" };

            foreach (var roleName in roles)
            {
                if (!await _roleManager.RoleExistsAsync(roleName))
                {
                    await _roleManager.CreateAsync(new IdentityRole(roleName));
                }
            }
        }

        private async Task SeedAreas()
        {
            if (await _context.Areas.AnyAsync())
            {
                return;
            }

            var areaNames = new[]
            {
                "Зона 1 - Надежда север",
                "Зона 2 - Център",
                "Зона 3 - Люлин",
                "Зона 4 - Овча Купел",
                "Зона 5 - Юг и Витоша",
                "Зона 6 - Изток"
            };

            var areas = areaNames.Select(name => new Area
            {
                Id = name,
                Name = name,
                Description = $"Area coverage for {name}"
            }).ToList();

            await _context.Areas.AddRangeAsync(areas);
            await _context.SaveChangesAsync();
        }

        private async Task SeedUsersFromJson()
        {
            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "users.json");

            if (!File.Exists(jsonPath))
            {
                return;
            }

            var json = await File.ReadAllTextAsync(jsonPath);
            var usersData = JsonSerializer.Deserialize<UsersJsonData>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (usersData?.Users == null || !usersData.Users.Any())
            {
                return;
            }

            foreach (var userData in usersData.Users)
            {
                if (await _userManager.FindByNameAsync(userData.Username) == null)
                {
                    var user = new User
                    {
                        UserName = userData.Username,
                        Email = userData.Email
                    };

                    var result = await _userManager.CreateAsync(user, userData.Password);

                    if (result.Succeeded)
                    {
                        await _userManager.AddToRoleAsync(user, userData.Role);
                    }
                }
            }
        }

        private async Task SeedTrucksFromJson()
        {
            if (await _context.Trucks.AnyAsync())
            {
                return;
            }

            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "trucks.json");

            if (!File.Exists(jsonPath))
            {
                return;
            }

            var json = await File.ReadAllTextAsync(jsonPath);
            var trucksData = JsonSerializer.Deserialize<TrucksJsonData>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (trucksData?.Trucks == null || !trucksData.Trucks.Any())
            {
                return;
            }

            var trucks = trucksData.Trucks.Select(t => new Truck
            {
                Id = t.Id,
                AreaId = t.AreaId,
                Capacity = t.Capacity,
                LocationX = t.LocationX,
                LocationY = t.LocationY
            }).ToList();

            await _context.Database.OpenConnectionAsync();
            try
            {
                await _context.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT [Trucks] ON");
                await _context.Trucks.AddRangeAsync(trucks);
                await _context.SaveChangesAsync();
                await _context.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT [Trucks] OFF");
            }
            finally
            {
                await _context.Database.CloseConnectionAsync();
            }
        }

        private async Task SeedContainersFromJson()
        {
            if (await _context.TrashContainers.AnyAsync())
            {
                return;
            }

            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Seed", "containers.json");

            if (!File.Exists(jsonPath))
            {
                return;
            }

            var json = await File.ReadAllTextAsync(jsonPath);
            var containersData = JsonSerializer.Deserialize<ContainersJsonData>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (containersData?.Containers == null || !containersData.Containers.Any())
            {
                return;
            }

            var now = DateTime.Now;
            var weather = GetDefaultWeather();

            var containers = containersData.Containers.Select(c => new TrashContainer
            {
                Id = c.Id,
                LocationX = c.LocationX,
                LocationY = c.LocationY,
                AreaId = c.AreaId,
                TrashType = (TrashType)c.TrashType,
                HasSensor = c.HasSensor,
                Capacity = c.Capacity,
                FillPercentage = CalculateInitialFill(c.AreaId, (TrashType)c.TrashType, now.Hour, now.DayOfWeek),
                Temperature = c.HasSensor ? CalculateInitialTemperature(weather.Temperature, (TrashType)c.TrashType, 50, now.Hour) : null,
                BatteryPercentage = c.HasSensor ? _random.Next(60, 100) : null,
                Status = TrashContainerStatus.Active
            }).ToList();

            await _context.TrashContainers.AddRangeAsync(containers);
            await _context.SaveChangesAsync();
        }

        private double CalculateInitialFill(string areaId, TrashType type, int hour, DayOfWeek day)
        {
            var baseFill = areaId switch
            {
                "Зона 2 - Център" => 65.0,
                "Зона 1 - Надежда север" => 45.0,
                "Зона 6 - Изток" => 40.0,
                "Зона 3 - Люлин" => 35.0,
                "Зона 4 - Овча Купел" => 30.0,
                "Зона 5 - Юг и Витоша" => 25.0,
                _ => 40.0
            };

            if (hour >= 18 && hour <= 22)
                baseFill += 15;
            else if (hour >= 0 && hour <= 6)
                baseFill -= 10;

            if (day == DayOfWeek.Friday || day == DayOfWeek.Saturday)
                baseFill += 10;
            else if (day == DayOfWeek.Sunday || day == DayOfWeek.Monday)
                baseFill -= 5;

            var typeFactor = type switch
            {
                TrashType.Mixed => 1.2,
                TrashType.Plastic => 1.1,
                TrashType.Paper => 1.0,
                TrashType.Glass => 0.8,
                _ => 1.0
            };

            baseFill *= typeFactor;
            baseFill += _random.Next(-10, 11);

            return Math.Clamp(baseFill, 5, 95);
        }

        private double CalculateInitialTemperature(double ambientTemp, TrashType type, double fillPercent, int hour)
        {
            var containerTemp = ambientTemp;

            if (type == TrashType.Mixed && fillPercent > 40)
                containerTemp += 3 + (fillPercent - 40) * 0.1;

            if (hour >= 10 && hour <= 17)
                containerTemp += _random.Next(5, 12);

            containerTemp += _random.Next(-2, 3);

            return Math.Round(containerTemp, 1);
        }

        private WeatherData GetDefaultWeather()
        {
            var month = DateTime.Now.Month;
            var hour = DateTime.Now.Hour;

            var temp = month switch
            {
                12 or 1 or 2 => 3.0,
                3 or 4 or 5 => 15.0,
                6 or 7 or 8 => 28.0,
                _ => 18.0
            };

            var diurnalOffset = hour switch
            {
                >= 4 and <= 6 => -5,
                >= 13 and <= 16 => +8,
                >= 20 or <= 3 => -3,
                _ => 0
            };

            return new WeatherData
            {
                Temperature = temp + diurnalOffset + _random.Next(-2, 3),
                Humidity = 65,
                Pressure = 1013,
                WeatherCondition = "Clear",
                WindSpeed = 3.5,
                Timestamp = DateTime.Now
            };
        }

        private class UsersJsonData
        {
            public List<UserJsonItem> Users { get; set; } = new();
        }

        private class UserJsonItem
        {
            public string Username { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string Role { get; set; } = string.Empty;
        }

        private class TrucksJsonData
        {
            public List<TruckJsonItem> Trucks { get; set; } = new();
        }

        private class TruckJsonItem
        {
            public int Id { get; set; }
            public string AreaId { get; set; } = string.Empty;
            public double Capacity { get; set; }
            public double LocationX { get; set; }
            public double LocationY { get; set; }
        }

        private class ContainersJsonData
        {
            public List<ContainerJsonItem> Containers { get; set; } = new();
        }

        private class ContainerJsonItem
        {
            public int Id { get; set; }
            public double LocationX { get; set; }
            public double LocationY { get; set; }
            public string AreaId { get; set; } = string.Empty;
            public int TrashType { get; set; }
            public bool HasSensor { get; set; }
            public double Capacity { get; set; }
        }
    }
}