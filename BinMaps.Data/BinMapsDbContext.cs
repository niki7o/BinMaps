
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

        
            public static async Task SeedRoles(RoleManager<IdentityRole> roleManager)
            {
                string[] roles = { "Admin", "Driver", "User" };
                foreach (var r in roles)
                    if (!await roleManager.RoleExistsAsync(r))
                        await roleManager.CreateAsync(new IdentityRole(r));
            }

            public static async Task SeedUsers(UserManager<User> userManager)
            {
                if (await userManager.FindByNameAsync("admin") == null)
                {
                    var admin = new User { UserName = "admin", Email = "admin@binmaps.com" };
                    await userManager.CreateAsync(admin, "Admin123!");
                    await userManager.AddToRoleAsync(admin, "Admin");
                }

                if (await userManager.FindByNameAsync("driver") == null)
                {
                    var driver = new User { UserName = "driver", Email = "driver@binmaps.com" };
                    await userManager.CreateAsync(driver, "Driver123!");
                    await userManager.AddToRoleAsync(driver, "Driver");
                }
            }
        

        public static async Task SeedAsync(BinMapsDbContext context)
        {








            if (!context.Areas.Any())
            {
                var areaNames = new[] { "Зона 1 - Надежда/Север", "Зона 2 - Център", "Зона 6 - Изток", "Зона 5 - Юг и Витоша", "Зона 3 - Люлин", "Зона 4 - Овча Купел" };
                var areas = areaNames.Select(name => new Area
                {
                    Id = name,
                    Name = name,
                    Description = $"Area coverage for {name}"
                }).ToList();

                await context.Areas.AddRangeAsync(areas);
                await context.SaveChangesAsync();
                Console.WriteLine("Areas seeded successfully.");
            }

            if (context.TrashContainers.Any())
            {
                Console.WriteLine($"Database already has {context.TrashContainers.Count()} containers. Skipping seed.");
                return;
            }

            var containers = new List<TrashContainer>

{
      new TrashContainer { Id = 1, LocationX = 23.30502009430058, LocationY = 42.704171338632555, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 45, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 2, LocationX = 23.326880670317696, LocationY = 42.69692221023526, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 22, BatteryPercentage = 82, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 3, LocationX = 23.3489144476248, LocationY = 42.64671730657379, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 94, FillPercentage = 85, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 4, LocationX = 23.278873777079824, LocationY = 42.6413870499304, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 89, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 5, LocationX = 23.283684462030568, LocationY = 42.67540249980753, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 80, BatteryPercentage = 45, FillPercentage = 10, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 6, LocationX = 23.34680099813568, LocationY = 42.71177979392916, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 23, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 7, LocationX = 23.355631547641686, LocationY = 42.66052903470625, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 77, FillPercentage = 54, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 8, LocationX = 23.287399908483845, LocationY = 42.69692619092856, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 91, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 9, LocationX = 23.28628772007423, LocationY = 42.675289237251505, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 24, BatteryPercentage = 31, FillPercentage = 42, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 10, LocationX = 23.329497868668895, LocationY = 42.72963273151584, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Glass, HasSensor = true, Temperature = 18, BatteryPercentage = 88, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 11, LocationX = 23.276189953930122, LocationY = 42.72049909230553, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 55, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 12, LocationX = 23.323485547648434, LocationY = 42.68297316043138, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 75, BatteryPercentage = 15, FillPercentage = 98, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 13, LocationX = 23.280662259163623, LocationY = 42.71520633633215, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 21, BatteryPercentage = 62, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 14, LocationX = 23.30541786196234, LocationY = 42.66034179316523, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 34, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 15, LocationX = 23.28514125749321, LocationY = 42.64930331006456, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 32, BatteryPercentage = 54, FillPercentage = 71, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 16, LocationX = 23.28522214445823, LocationY = 42.68095400931234, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 17, LocationX = 23.344222004805108, LocationY = 42.65614757424381, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 30, BatteryPercentage = 91, FillPercentage = 38, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 18, LocationX = 23.305287586976398, LocationY = 42.708590766609426, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 33, BatteryPercentage = 47, FillPercentage = 84, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 19, LocationX = 23.306404323774412, LocationY = 42.722369027506915, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 60, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 20, LocationX = 23.298955686894402, LocationY = 42.728390032171944, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 36, BatteryPercentage = 12, FillPercentage = 95, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 21, LocationX = 23.326949391152464, LocationY = 42.648442907524334, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 34, BatteryPercentage = 88, FillPercentage = 80, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 22, LocationX = 23.347191818026864, LocationY = 42.73727094280873, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 30, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 23, LocationX = 23.346077980016585, LocationY = 42.703574950871094, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Paper, HasSensor = true, Temperature = 26, BatteryPercentage = 42, FillPercentage = 38, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 24, LocationX = 23.367641574823743, LocationY = 42.645124456456955, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 95, FillPercentage = 32, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 25, LocationX = 23.34292537561514, LocationY = 42.67409968328124, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 69, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 26, LocationX = 23.345812554290344, LocationY = 42.667164713779435, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 36, BatteryPercentage = 15, FillPercentage = 92, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 27, LocationX = 23.307156424202066, LocationY = 42.6435192073208, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 73, FillPercentage = 71, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 28, LocationX = 23.288307234364016, LocationY = 42.70894541246179, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 61, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 29, LocationX = 23.33651196375957, LocationY = 42.68612380857139, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 18, BatteryPercentage = 54, FillPercentage = 0, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 30, LocationX = 23.28570668457782, LocationY = 42.64508966551495, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 30, BatteryPercentage = 36, FillPercentage = 91, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 31, LocationX = 23.31116996285773, LocationY = 42.640630056737315, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 3, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 32, LocationX = 23.355237750818635, LocationY = 42.682194393297614, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 75, BatteryPercentage = 82, FillPercentage = 16, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 33, LocationX = 23.35776335253371, LocationY = 42.682119157003825, AreaId = "Зона 6 - Изток", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 100, FillPercentage = 26, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 34, LocationX = 23.300196324849367, LocationY = 42.68436470899153, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 35, LocationX = 23.36903731784769, LocationY = 42.7335623975412, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 20, BatteryPercentage = 65, FillPercentage = 9, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 36, LocationX = 23.353950494128796, LocationY = 42.71133104876195, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Paper, HasSensor = true, Temperature = 23, BatteryPercentage = 12, FillPercentage = 21, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 37, LocationX = 23.271780748896617, LocationY = 42.711941022307265, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 38, LocationX = 23.27841285342789, LocationY = 42.73246804667271, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 25, BatteryPercentage = 58, FillPercentage = 36, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 39, LocationX = 23.34768753112148, LocationY = 42.72019547278927, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 21, BatteryPercentage = 77, FillPercentage = 13, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 40, LocationX = 23.367890356743313, LocationY = 42.73080147763472, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 60, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 41, LocationX = 23.352931379689, LocationY = 42.723375717488686, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Paper, HasSensor = true, Temperature = 34, BatteryPercentage = 82, FillPercentage = 77, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 42, LocationX = 23.342886083794742, LocationY = 42.737704680172214, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 15, FillPercentage = 24, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 43, LocationX = 23.324246724703997, LocationY = 42.68450203267344, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 61, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 44, LocationX = 23.356755192326816, LocationY = 42.66806800678269, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 90, FillPercentage = 72, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 45, LocationX = 23.321938716817627, LocationY = 42.65708343849647, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 26, BatteryPercentage = 64, FillPercentage = 48, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 46, LocationX = 23.319702289684244, LocationY = 42.683906868497864, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 41, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 47, LocationX = 23.3384025285363, LocationY = 42.67345091621989, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 34, BatteryPercentage = 22, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 48, LocationX = 23.276507108822813, LocationY = 42.65318419457027, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 75, BatteryPercentage = 51, FillPercentage = 71, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 49, LocationX = 23.293229389090065, LocationY = 42.681476944011315, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 90, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 50, LocationX = 23.30641776908631, LocationY = 42.69512771986159, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 22, BatteryPercentage = 89, FillPercentage = 16, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 51, LocationX = 23.35831767905118, LocationY = 42.65887094974426, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 19, BatteryPercentage = 34, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 52, LocationX = 23.34572943211795, LocationY = 42.6810894701898, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 58, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 53, LocationX = 23.314197657417992, LocationY = 42.64784660940299, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 26, BatteryPercentage = 91, FillPercentage = 38, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 54, LocationX = 23.27614211833049, LocationY = 42.692457386473805, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 24, BatteryPercentage = 48, FillPercentage = 35, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 55, LocationX = 23.302847224285784, LocationY = 42.652594645426454, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 53, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 56, LocationX = 23.29046961854451, LocationY = 42.718816030625554, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 28, BatteryPercentage = 67, FillPercentage = 48, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 57, LocationX = 23.27320060814625, LocationY = 42.68989196562256, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 27, BatteryPercentage = 25, FillPercentage = 52, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 58, LocationX = 23.34418093720497, LocationY = 42.73487795398019, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 99, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 59, LocationX = 23.327069662283975, LocationY = 42.65533324927033, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 19, BatteryPercentage = 81, FillPercentage = 2, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 60, LocationX = 23.31181405844416, LocationY = 42.66981862204101, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 77, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 61, LocationX = 23.33644917904008, LocationY = 42.64805367618059, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 25, BatteryPercentage = 44, FillPercentage = 45, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 62, LocationX = 23.277054941916326, LocationY = 42.71118171128362, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 36, BatteryPercentage = 96, FillPercentage = 90, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 63, LocationX = 23.32831518206122, LocationY = 42.68413697960686, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 18, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 64, LocationX = 23.351658428172914, LocationY = 42.66107872688756, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 33, FillPercentage = 74, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 65, LocationX = 23.28479532551508, LocationY = 42.6694676572709, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 22, BatteryPercentage = 61, FillPercentage = 22, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 66, LocationX = 23.338271701980844, LocationY = 42.66885662707769, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 6, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 67, LocationX = 23.339668388657696, LocationY = 42.71765103433602, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 27, BatteryPercentage = 12, FillPercentage = 49, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 68, LocationX = 23.357117180424574, LocationY = 42.65651817666277, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 75, BatteryPercentage = 85, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 69, LocationX = 23.292520379964593, LocationY = 42.68449171720641, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 35, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 70, LocationX = 23.36001099195392, LocationY = 42.72124503797967, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Glass, HasSensor = true, Temperature = 20, BatteryPercentage = 49, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 71, LocationX = 23.313462529241946, LocationY = 42.73030218731118, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 29, BatteryPercentage = 92, FillPercentage = 62, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 72, LocationX = 23.284214693992226, LocationY = 42.6397330510617, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 27, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 73, LocationX = 23.36537754388657, LocationY = 42.67389146141387, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 35, BatteryPercentage = 10, FillPercentage = 93, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 74, LocationX = 23.29056157018318, LocationY = 42.70997321262441, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 30, BatteryPercentage = 66, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 75, LocationX = 23.31422791443657, LocationY = 42.66205886365022, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 81, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 76, LocationX = 23.324838634816913, LocationY = 42.70002167448206, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 84, FillPercentage = 40, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 77, LocationX = 23.359263435889616, LocationY = 42.66854580251999, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 23, BatteryPercentage = 27, FillPercentage = 19, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 78, LocationX = 23.275005881472534, LocationY = 42.64726590393043, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 75, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 79, LocationX = 23.332028604725657, LocationY = 42.64551723145115, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 59, FillPercentage = 28, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 80, LocationX = 23.28123456789, LocationY = 42.701123456789, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 100, FillPercentage = 50, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 81, LocationX = 23.3187654321, LocationY = 42.68987654321, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 92, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 82, LocationX = 23.303456789, LocationY = 42.7123456789, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Paper, HasSensor = true, Temperature = 22, BatteryPercentage = 15, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 83, LocationX = 23.27456789, LocationY = 42.723456789, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 75, BatteryPercentage = 68, FillPercentage = 43, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 84, LocationX = 23.3656789, LocationY = 42.66456789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 66, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 85, LocationX = 23.33123456, LocationY = 42.65123456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 24, BatteryPercentage = 94, FillPercentage = 24, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 86, LocationX = 23.30123456, LocationY = 42.68123456, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 38, FillPercentage = 78, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 87, LocationX = 23.32456789, LocationY = 42.69456789, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 88, LocationX = 23.34456789, LocationY = 42.63456789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 36, BatteryPercentage = 71, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 89, LocationX = 23.30123456, LocationY = 42.66123456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 36, BatteryPercentage = 42, FillPercentage = 94, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 90, LocationX = 23.37123456, LocationY = 42.67123456, AreaId = "Зона 6 - Изток", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 37, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 91, LocationX = 23.29123456, LocationY = 42.72123456, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 28, BatteryPercentage = 55, FillPercentage = 52, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 92, LocationX = 23.34456789, LocationY = 42.68456789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 32, BatteryPercentage = 12, FillPercentage = 60, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 93, LocationX = 23.29456789, LocationY = 42.64456789, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 15, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 94, LocationX = 23.32456789, LocationY = 42.70456789, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 75, BatteryPercentage = 89, FillPercentage = 42, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 95, LocationX = 23.35456789, LocationY = 42.69456789, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 63, FillPercentage = 81, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 96, LocationX = 23.31456789, LocationY = 42.67456789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 97, LocationX = 23.28456789, LocationY = 42.68456789, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 47, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 98, LocationX = 23.33456789, LocationY = 42.69456789, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 36, BatteryPercentage = 98, FillPercentage = 97, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 99, LocationX = 23.36456789, LocationY = 42.64456789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 35, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 100, LocationX = 23.25456789, LocationY = 42.71456789, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 18, BatteryPercentage = 30, FillPercentage = 2, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 101, LocationX = 23.321, LocationY = 42.6689, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 20, BatteryPercentage = 88, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 102, LocationX = 23.3345, LocationY = 42.6912, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 92, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 103, LocationX = 23.348, LocationY = 42.645, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 42, FillPercentage = 55, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 104, LocationX = 23.273, LocationY = 42.712, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 20, BatteryPercentage = 15, FillPercentage = 8, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 105, LocationX = 23.371, LocationY = 42.6744, AreaId = "Зона 6 - Изток", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 44, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 106, LocationX = 23.3012, LocationY = 42.7123, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 58, FillPercentage = 59, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 107, LocationX = 23.2876, LocationY = 42.6934, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 41, FillPercentage = 72, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 108, LocationX = 23.3221, LocationY = 42.7289, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 26, BatteryPercentage = 73, FillPercentage = 39, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 109, LocationX = 23.3344, LocationY = 42.6811, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 58, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 110, LocationX = 23.3122, LocationY = 42.6999, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 30, BatteryPercentage = 85, FillPercentage = 67, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 111, LocationX = 23.2998, LocationY = 42.7021, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 25, BatteryPercentage = 72, FillPercentage = 47, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 112, LocationX = 23.3155, LocationY = 42.6887, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 29, BatteryPercentage = 53, FillPercentage = 61, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 113, LocationX = 23.3321, LocationY = 42.6742, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 33, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 114, LocationX = 23.3412, LocationY = 42.6994, AreaId = "Зона 6 - Изток", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 31, BatteryPercentage = 84, FillPercentage = 68, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 115, LocationX = 23.3277, LocationY = 42.7129, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 23, BatteryPercentage = 39, FillPercentage = 28, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 116, LocationX = 23.3099, LocationY = 42.6918, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 34, BatteryPercentage = 77, FillPercentage = 83, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 117, LocationX = 23.2891, LocationY = 42.7055, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 52, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 118, LocationX = 23.3011, LocationY = 42.7183, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 27, BatteryPercentage = 69, FillPercentage = 49, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 119, LocationX = 23.3222, LocationY = 42.6944, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 30, BatteryPercentage = 58, FillPercentage = 64, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 120, LocationX = 23.3455, LocationY = 42.6833, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 32, BatteryPercentage = 74, FillPercentage = 70, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 121, LocationX = 23.3567, LocationY = 42.7121, AreaId = "Зона 6 - Изток", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 41, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 122, LocationX = 23.3688, LocationY = 42.6998, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 24, BatteryPercentage = 63, FillPercentage = 34, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 123, LocationX = 23.3544, LocationY = 42.6881, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 33, BatteryPercentage = 52, FillPercentage = 76, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 124, LocationX = 23.3411, LocationY = 42.6749, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 25, BatteryPercentage = 88, FillPercentage = 44, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 125, LocationX = 23.3299, LocationY = 42.7011, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 59, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 126, LocationX = 23.3188, LocationY = 42.7156, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 29, BatteryPercentage = 91, FillPercentage = 57, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 127, LocationX = 23.3077, LocationY = 42.7288, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 31, BatteryPercentage = 46, FillPercentage = 69, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 128, LocationX = 23.2966, LocationY = 42.7399, AreaId = "Зона 6 - Изток", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 55, FillPercentage = 29, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 129, LocationX = 23.2844, LocationY = 42.7488, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 73, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 130, LocationX = 23.2711, LocationY = 42.7599, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 34, BatteryPercentage = 62, FillPercentage = 82, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 131, LocationX = 23.2599, LocationY = 42.7688, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 22, BatteryPercentage = 44, FillPercentage = 18, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 132, LocationX = 23.2488, LocationY = 42.7799, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Glass, HasSensor = true, Temperature = 28, BatteryPercentage = 71, FillPercentage = 53, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 133, LocationX = 23.2377, LocationY = 42.7888, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 47, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 134, LocationX = 23.2266, LocationY = 42.7999, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 30, BatteryPercentage = 83, FillPercentage = 65, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 135, LocationX = 23.2155, LocationY = 42.8122, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 24, BatteryPercentage = 57, FillPercentage = 33, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 136, LocationX = 23.2044, LocationY = 42.8211, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 32, BatteryPercentage = 69, FillPercentage = 71, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 137, LocationX = 23.1933, LocationY = 42.8333, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 62, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 138, LocationX = 23.1822, LocationY = 42.8444, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 27, BatteryPercentage = 92, FillPercentage = 48, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 139, LocationX = 23.1711, LocationY = 42.8555, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 33, BatteryPercentage = 61, FillPercentage = 79, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 140, LocationX = 23.1599, LocationY = 42.8666, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 21, BatteryPercentage = 48, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 141, LocationX = 23.1488, LocationY = 42.8777, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 58, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 142, LocationX = 23.1377, LocationY = 42.8888, AreaId = "Зона 6 - Изток", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 29, BatteryPercentage = 73, FillPercentage = 55, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 143, LocationX = 23.1266, LocationY = 42.8999, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 32, BatteryPercentage = 59, FillPercentage = 72, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 144, LocationX = 23.1155, LocationY = 42.9111, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 26, BatteryPercentage = 66, FillPercentage = 38, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 145, LocationX = 23.1044, LocationY = 42.9222, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 49, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 146, LocationX = 23.0933, LocationY = 42.9333, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 87, FillPercentage = 51, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 147, LocationX = 23.0822, LocationY = 42.9444, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 30, BatteryPercentage = 44, FillPercentage = 63, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 148, LocationX = 23.0711, LocationY = 42.9555, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 34, BatteryPercentage = 52, FillPercentage = 86, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 149, LocationX = 23.0599, LocationY = 42.9666, AreaId = "Зона 6 - Изток", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 67, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 150, LocationX = 23.0488, LocationY = 42.9777, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 23, BatteryPercentage = 78, FillPercentage = 27, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 151, LocationX = 23.3421, LocationY = 42.7156, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 80, BatteryPercentage = 64, FillPercentage = 29, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 152, LocationX = 23.3654, LocationY = 42.6912, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 25, BatteryPercentage = 10, FillPercentage = 93, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 153, LocationX = 23.2754, LocationY = 42.7014, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 154, LocationX = 23.3354, LocationY = 42.6687, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 13, BatteryPercentage = 87, FillPercentage = 41, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 155, LocationX = 23.2842, LocationY = 42.6512, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 19, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 156, LocationX = 23.3102, LocationY = 42.6842, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 62, BatteryPercentage = 52, FillPercentage = 68, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 157, LocationX = 23.3154, LocationY = 42.6987, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 69, BatteryPercentage = 31, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 158, LocationX = 23.3754, LocationY = 42.6621, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 82, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 159, LocationX = 23.3452, LocationY = 42.6456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 1, BatteryPercentage = 94, FillPercentage = 37, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 160, LocationX = 23.2842, LocationY = 42.6712, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 50, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 161, LocationX = 23.3254, LocationY = 42.7214, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 22, BatteryPercentage = 77, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 162, LocationX = 23.2564, LocationY = 42.7121, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 26, BatteryPercentage = 23, FillPercentage = 89, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 163, LocationX = 23.3452, LocationY = 42.6842, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 64, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 164, LocationX = 23.3214, LocationY = 42.6954, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 68, FillPercentage = 27, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 165, LocationX = 23.3542, LocationY = 42.6587, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 43, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 166, LocationX = 23.3854, LocationY = 42.6712, AreaId = "Зона 6 - Изток", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 31, BatteryPercentage = 89, FillPercentage = 76, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 167, LocationX = 23.2754, LocationY = 42.6412, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 22, BatteryPercentage = 42, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 168, LocationX = 23.3087, LocationY = 42.6634, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 97, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 169, LocationX = 23.3354, LocationY = 42.6456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 15, FillPercentage = 52, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 170, LocationX = 23.3124, LocationY = 42.7154, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 31, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 171, LocationX = 23.2842, LocationY = 42.7231, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 24, BatteryPercentage = 81, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 172, LocationX = 23.2954, LocationY = 42.6842, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Paper, HasSensor = true, Temperature = 27, BatteryPercentage = 36, FillPercentage = 69, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 173, LocationX = 23.3321, LocationY = 42.6954, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 174, LocationX = 23.3254, LocationY = 42.6687, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 25, BatteryPercentage = 54, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 175, LocationX = 23.3642, LocationY = 42.6512, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 47, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 176, LocationX = 23.3421, LocationY = 42.7014, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 33, BatteryPercentage = 90, FillPercentage = 92, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 177, LocationX = 23.3452, LocationY = 42.6435, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 26, BatteryPercentage = 12, FillPercentage = 33, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 178, LocationX = 23.3087, LocationY = 42.6612, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 58, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 179, LocationX = 23.3754, LocationY = 42.6712, AreaId = "Зона 6 - Изток", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 67, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 180, LocationX = 23.2842, LocationY = 42.6412, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 95, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 181, LocationX = 23.3154, LocationY = 42.6954, AreaId = "Зона 2 - Център", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 34, FillPercentage = 22, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 182, LocationX = 23.3254, LocationY = 42.7121, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Paper, HasSensor = true, Temperature = 25, BatteryPercentage = 82, FillPercentage = 49, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 183, LocationX = 23.2654, LocationY = 42.7014, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 76, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 184, LocationX = 23.3354, LocationY = 42.6789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 15, FillPercentage = 8, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 185, LocationX = 23.3754, LocationY = 42.6587, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 93, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 186, LocationX = 23.2842, LocationY = 42.6721, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 27, BatteryPercentage = 58, FillPercentage = 41, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 187, LocationX = 23.3412, LocationY = 42.6456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 26, BatteryPercentage = 91, FillPercentage = 67, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 188, LocationX = 23.3124, LocationY = 42.6634, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 189, LocationX = 23.3654, LocationY = 42.6954, AreaId = "Зона 6 - Изток", TrashType = TrashType.Glass, HasSensor = true, Temperature = 24, BatteryPercentage = 47, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 190, LocationX = 23.2754, LocationY = 42.7154, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 191, LocationX = 23.3421, LocationY = 42.7231, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 28, BatteryPercentage = 22, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 192, LocationX = 23.3254, LocationY = 42.6842, AreaId = "Зона 2 - Център", TrashType = TrashType.Paper, HasSensor = true, Temperature = 24, BatteryPercentage = 76, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 193, LocationX = 23.3154, LocationY = 42.6687, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 99, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 194, LocationX = 23.3354, LocationY = 42.6512, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 39, FillPercentage = 45, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 195, LocationX = 23.2754, LocationY = 42.6435, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 61, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 196, LocationX = 23.3124, LocationY = 42.7014, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 26, BatteryPercentage = 84, FillPercentage = 8, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 197, LocationX = 23.3642, LocationY = 42.6612, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 27, BatteryPercentage = 15, FillPercentage = 75, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 198, LocationX = 23.3452, LocationY = 42.6456, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 33, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 199, LocationX = 23.2954, LocationY = 42.6712, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 22, BatteryPercentage = 62, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 200, LocationX = 23.3754, LocationY = 42.6954, AreaId = "Зона 6 - Изток", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 201, LocationX = 23.321, LocationY = 42.6689, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 25, BatteryPercentage = 45, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 202, LocationX = 23.348, LocationY = 42.645, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 88, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 203, LocationX = 23.273, LocationY = 42.712, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 24, BatteryPercentage = 92, FillPercentage = 34, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 204, LocationX = 23.291, LocationY = 42.684, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 40, BatteryPercentage = 15, FillPercentage = 67, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 205, LocationX = 23.314, LocationY = 42.7215, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 41, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 206, LocationX = 23.372, LocationY = 42.658, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 90, BatteryPercentage = 78, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 207, LocationX = 23.308, LocationY = 42.665, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 95, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 208, LocationX = 23.361, LocationY = 42.673, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 56, BatteryPercentage = 33, FillPercentage = 22, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 209, LocationX = 23.285, LocationY = 42.641, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 40, BatteryPercentage = 56, FillPercentage = 81, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 210, LocationX = 23.321, LocationY = 42.698, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 14, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 211, LocationX = 23.342, LocationY = 42.73, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 25, BatteryPercentage = 90, FillPercentage = 55, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 212, LocationX = 23.268, LocationY = 42.705, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 50, BatteryPercentage = 12, FillPercentage = 99, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 213, LocationX = 23.284, LocationY = 42.677, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 30, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 214, LocationX = 23.331, LocationY = 42.648, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 25, BatteryPercentage = 64, FillPercentage = 42, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 215, LocationX = 23.359, LocationY = 42.6615, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 76, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 216, LocationX = 23.315, LocationY = 42.682, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 24, BatteryPercentage = 81, FillPercentage = 19, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 217, LocationX = 23.368, LocationY = 42.695, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 29, BatteryPercentage = 27, FillPercentage = 51, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 218, LocationX = 23.279, LocationY = 42.645, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 60, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 219, LocationX = 23.302, LocationY = 42.715, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Glass, HasSensor = true, Temperature = 21, BatteryPercentage = 54, FillPercentage = 8, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 220, LocationX = 23.342, LocationY = 42.668, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 37, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 221, LocationX = 23.375, LocationY = 42.651, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 55, BatteryPercentage = 93, FillPercentage = 72, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 222, LocationX = 23.281, LocationY = 42.708, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Paper, HasSensor = true, Temperature = 25, BatteryPercentage = 40, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 223, LocationX = 23.288, LocationY = 42.671, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 89, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 224, LocationX = 23.341, LocationY = 42.646, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Glass, HasSensor = true, Temperature = 76, BatteryPercentage = 18, FillPercentage = 56, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 225, LocationX = 23.314, LocationY = 42.692, AreaId = "Зона 2 - Център", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 24, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 226, LocationX = 23.311, LocationY = 42.661, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 30, BatteryPercentage = 71, FillPercentage = 48, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 227, LocationX = 23.362, LocationY = 42.688, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 50, BatteryPercentage = 55, FillPercentage = 93, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 228, LocationX = 23.331, LocationY = 42.723, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 62, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 229, LocationX = 23.281, LocationY = 42.654, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 70, BatteryPercentage = 29, FillPercentage = 5, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 230, LocationX = 23.262, LocationY = 42.711, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 45, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 231, LocationX = 23.338, LocationY = 42.684, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 25, BatteryPercentage = 88, FillPercentage = 12, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 232, LocationX = 23.355, LocationY = 42.665, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 40, BatteryPercentage = 42, FillPercentage = 78, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 233, LocationX = 23.351, LocationY = 42.735, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 19, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 234, LocationX = 23.305, LocationY = 42.698, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 23, BatteryPercentage = 63, FillPercentage = 4, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 235, LocationX = 23.279, LocationY = 42.674, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 91, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 236, LocationX = 23.348, LocationY = 42.641, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 29, BatteryPercentage = 15, FillPercentage = 64, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 237, LocationX = 23.305, LocationY = 42.661, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 28, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 238, LocationX = 23.3745, LocationY = 42.6712, AreaId = "Зона 6 - Изток", TrashType = TrashType.Paper, HasSensor = true, Temperature = 30, BatteryPercentage = 82, FillPercentage = 50, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 239, LocationX = 23.2882, LocationY = 42.6435, AreaId = "Зона 4 - Овча Купел", TrashType = TrashType.Glass, HasSensor = true, Temperature = 61, BatteryPercentage = 37, FillPercentage = 98, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 240, LocationX = 23.3321, LocationY = 42.7056, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 11, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 241, LocationX = 23.2654, LocationY = 42.7214, AreaId = "Зона 3 - Люлин", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 31, BatteryPercentage = 54, FillPercentage = 44, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 242, LocationX = 23.3034, LocationY = 42.6789, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Paper, HasSensor = true, Temperature = 25, BatteryPercentage = 96, FillPercentage = 8, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 243, LocationX = 23.3577, LocationY = 42.7183, AreaId = "Зона 1 - Надежда/Север", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 67, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 244, LocationX = 23.3245, LocationY = 42.7084, AreaId = "Зона 2 - Център", TrashType = TrashType.Glass, HasSensor = true, Temperature = 30, BatteryPercentage = 21, FillPercentage = 52, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 245, LocationX = 23.3456, LocationY = 42.6632, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Mixed, HasSensor = false, FillPercentage = 83, Capacity = 1100, Status = TrashContainerStatus.Active },
new TrashContainer { Id = 246, LocationX = 23.3123, LocationY = 42.6451, AreaId = "Зона 5 - Юг и Витоша", TrashType = TrashType.Plastic, HasSensor = true, Temperature = 25, BatteryPercentage = 89, FillPercentage = 20, Capacity = 1100, Status = TrashContainerStatus.Active }

        };


            if (!context.Trucks.Any())
            {
                var trucks = new List<Truck> {

                   
            new Truck
            {
                Id = 1,

                AreaId = "Зона 2 - Център",

                Capacity = 12000,
                LocationX = 23.3219,
                LocationY = 42.6977
            },
            new Truck
            {
                Id = 2,

                AreaId = "Зона 1 - Надежда/Север",

                Capacity = 12000,
                LocationX = 23.3400,
                LocationY = 42.7350
            },
            new Truck
            {
                Id = 3,

                AreaId = "Зона 3 - Люлин",

                Capacity = 12000,
                LocationX = 23.2750,
                LocationY = 42.7400
            },
            new Truck
            {
                Id = 4,

                AreaId = "Зона 4 - Овча Купел",

                Capacity = 12000,
                LocationX = 23.2600,
                LocationY = 42.6700
            },
            new Truck
            {
                Id = 5,

                AreaId = "Зона 6 - Изток",

                Capacity = 12000,
                LocationX = 23.3700,
                LocationY = 42.6900
            },
            new Truck
            {
                Id = 6,

                AreaId = "Зона 5 - Юг и Витоша",

                Capacity = 12000,
                LocationX = 23.3300,
                LocationY = 42.6500
            }
        
        };

                await context.Database.OpenConnectionAsync();
                try
                {
               
                    await context.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT [Trucks] ON");

                  
                    await context.Trucks.AddRangeAsync(trucks);
                    await context.SaveChangesAsync();

                    await context.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT [Trucks] OFF");
                }
                finally
                {
                    await context.Database.CloseConnectionAsync();
                }
              


            }



            try
            {
                Console.WriteLine($"Attempting to seed {containers.Count} containers...");
                await context.TrashContainers.AddRangeAsync(containers);
                await context.SaveChangesAsync();
                Console.WriteLine("Containers seeded successfully!");
            }
            catch (Exception ex)
            {
               
                Console.WriteLine(ex.Message);
                if (ex.InnerException != null)
                    Console.WriteLine($"Inner Error: {ex.InnerException.Message}");
            }
        }
    }
}

