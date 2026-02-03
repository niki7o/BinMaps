using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;

namespace BinMaps.API
{
    public class Program
    {
        public static async Task Main(string[] args)
        {


            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

            builder.Services.AddDbContext<BinMapsDbContext>(options =>
               options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

           
            builder.Services.AddControllers();
            // Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services.AddIdentity<User, IdentityRole>(options =>
            {
               
                options.Password.RequireDigit = true;           
                options.Password.RequireLowercase = true;       
                options.Password.RequireUppercase = true;       
                options.Password.RequireNonAlphanumeric = false; 
                options.Password.RequiredLength = 6;          

                options.User.RequireUniqueEmail = true;         
                options.User.AllowedUserNameCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+ "; 
            })
 .AddEntityFrameworkStores<BinMapsDbContext>()
 .AddDefaultTokenProviders();
            builder.Services.AddScoped(typeof(IRepository<,>), typeof(Repository<,>));
            builder.Services.AddScoped<ITruckRouteService, TruckRouteService>();
            builder.Services.AddScoped<IAuthService, AuthService>();
            builder.Services.AddScoped<IReportService, ReportService>();
            builder.Services.AddScoped<IAIService, AIService>();
            builder.Services.AddCors(options => {
                options.AddPolicy("AllowAngular", policy => {
                    policy.WithOrigins("http://localhost:4200")
                          .AllowAnyHeader()
                          .AllowAnyMethod();
                });
            });
            var app = builder.Build();

           

           

            using (var scope = app.Services.CreateScope())
            {
                var services = scope.ServiceProvider;
                var context = services.GetRequiredService<BinMapsDbContext>();
                var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
                var userManager = services.GetRequiredService<UserManager<User>>();


                await context.Database.MigrateAsync();
                await BinMapsDbContext.SeedRoles(roleManager);
                await BinMapsDbContext.SeedUsers(userManager);
                await BinMapsDbContext.SeedAsync(context);
            }
            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }


            app.UseCors("AllowAngular");
            app.UseHttpsRedirection();

            app.UseAuthentication();
            app.UseAuthorization();
           

            app.MapControllers();

           await app.RunAsync();
        }
    }
}