using BinMaps.API.Json;
using BinMaps.API.Seed;
using BinMaps.Data;
using BinMaps.Data.Entities;
using BinMaps.Infrastructure;
using BinMaps.Infrastructure.Hubs;
using BinMaps.Infrastructure.Repository;
using BinMaps.Infrastructure.Services;
using BinMaps.Infrastructure.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;

namespace BinMaps.API;

public sealed class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        #region Database & Identity

        builder.Services.AddDbContext<BinMapsDbContext>(o =>
            o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

        builder.Services.AddIdentity<User, IdentityRole>(o =>
        {
            o.Password.RequireDigit = true;
            o.Password.RequireLowercase = true;
            o.Password.RequireUppercase = true;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequiredLength = 6;
            o.User.RequireUniqueEmail = true;
            o.User.AllowedUserNameCharacters =
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+ ";
        })
        .AddEntityFrameworkStores<BinMapsDbContext>()
        .AddDefaultTokenProviders();

        #endregion

        #region JWT Authentication

        var jwtSection = builder.Configuration.GetSection("Jwt");
        var jwtKey = Encoding.UTF8.GetBytes(
            jwtSection["Key"] ?? throw new InvalidOperationException("Jwt:Key not configured."));

        builder.Services
            .AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(o =>
            {
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtSection["Issuer"],
                    ValidAudience = jwtSection["Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(jwtKey),
                    ClockSkew = TimeSpan.Zero
                };
                o.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var token = ctx.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) &&
                            ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                            ctx.Token = token;
                        return Task.CompletedTask;
                    }
                };
            });

        #endregion

        #region Application Services

        builder.Services.AddMemoryCache();
        builder.Services.AddSingleton<Random>(_ => new Random());
        // Live driver telemetry cache — last-known position per active driver
        // so clients can catch up via GET /api/route-runs/active on connect.
        builder.Services.AddSingleton<BinMaps.Infrastructure.Hubs.LiveDriverTracker>();
        builder.Services.AddScoped(typeof(IRepository<,>), typeof(Repository<,>));
        builder.Services.AddScoped<ITruckRouteService, TruckRouteService>();
        builder.Services.AddScoped<IRouteRunService, RouteRunService>();
        builder.Services.AddScoped<IAuthService, AuthService>();
        builder.Services.AddScoped<IReportService, ReportService>();
        builder.Services.AddScoped<IAIService, AIService>();
        builder.Services.AddScoped<IReputationService, ReputationService>();
        builder.Services.AddScoped<IContainerUpdateService, ContainerUpdateService>();
        builder.Services.AddScoped<FillageSimulator>();
        builder.Services.AddScoped<InitialStateSeeder>();
        builder.Services.AddHostedService<ContainerDynamicsService>();
        builder.Services.AddSignalR();

        #endregion

        #region External API Clients

        builder.Services.AddHttpClient<IExternalWeatherService, OpenWeatherService>();
        builder.Services.AddHttpClient<IExternalRoutingService, TomTomRoutingService>();

        #endregion

        #region CORS

        var allowedOrigins = builder.Configuration
            .GetValue<string>("AllowedOrigins", "http://localhost:4200")!
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        builder.Services.AddCors(o =>
            o.AddPolicy("AllowAngular", p =>
                p.WithOrigins(allowedOrigins)
                 .AllowAnyHeader()
                 .AllowAnyMethod()
                 .AllowCredentials()));

        #endregion

        #region Swagger

        builder.Services
            .AddControllers()
            .AddJsonOptions(o =>
            {
                // Always emit DateTime fields as ISO-8601 UTC with a trailing Z.
                // Without this, EF returns Kind=Unspecified and the browser
                // interprets the timestamp as local time (2-3h offset bug).
                o.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
                o.JsonSerializerOptions.Converters.Add(new UtcNullableDateTimeConverter());

                // Tolerant enum binding: accept ints (0), numeric strings
                // ("0"), and named strings ("Mixed") interchangeably.
                // Why: Angular <select [value]="0"> binds the model as the
                // STRING "0", not the number 0. Without this converter, every
                // such request 400s on enum properties. Rather than chase
                // [ngValue] across every dropdown forever, accept both forms
                // here. allowIntegerValues:true keeps the existing numeric
                // contract; the string fallback is the new tolerance.
                o.JsonSerializerOptions.Converters.Add(
                    new System.Text.Json.Serialization.JsonStringEnumConverter(
                        namingPolicy: null,
                        allowIntegerValues: true));
            });
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(o =>
        {
            o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Description = "JWT Bearer token"
            });
            o.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference
                        {
                            Type = ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            });
        });

        #endregion

        var app = builder.Build();

        #region Forwarded Headers

        app.UseForwardedHeaders(new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
        });

        #endregion

        #region Health & Readiness Endpoints

        app.MapGet("/ping", () => Results.Ok("pong")).AllowAnonymous();

        
        app.MapGet("/ready", async (BinMapsDbContext db) =>
        {
            try
            {
                var canConnect = await db.Database.CanConnectAsync();
                return canConnect ? Results.Ok("ready") : Results.StatusCode(503);
            }
            catch
            {
                return Results.StatusCode(503);
            }
        }).AllowAnonymous();

        #endregion

        #region Middleware Pipeline

        app.UseSwagger();
        app.UseSwaggerUI();

        app.UseCors("AllowAngular");

        var webRoot = app.Environment.WebRootPath
            ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

        Directory.CreateDirectory(Path.Combine(webRoot, "uploads", "reports"));
        Directory.CreateDirectory(Path.Combine(webRoot, "uploads", "profiles"));

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(webRoot)
        });

        if (!app.Environment.IsProduction())
            app.UseHttpsRedirection();

        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapHub<ContainerHub>("/hubs/containers");
        app.MapControllers();

        #endregion

        #region Migration & Seed


        await app.StartAsync();   

        var startupLogger = app.Services.GetRequiredService<ILogger<Program>>();
        for (int attempt = 1; attempt <= 5; attempt++)
        {
            try
            {
                startupLogger.LogInformation("Migration attempt {Attempt}/5 starting...", attempt);
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();
                await db.Database.MigrateAsync();

                // Schema sanity check: list of tables MigrateAsync() *should*
                // have created if everything went well. If any are missing,
                // EF's __EFMigrationsHistory likely went out of sync with the
                // actual schema (we've seen this happen when the DB was
                // restored from a snapshot that pre-dated a migration but
                // the history table was preserved). Log a loud, actionable
                // error so the next request that hits the missing table
                // doesn't surface as a cryptic 400 in the browser console.
                await EnsureCriticalTablesExistAsync(db, startupLogger);

                var seeder = scope.ServiceProvider.GetRequiredService<InitialStateSeeder>();
                await seeder.SeedAllAsync();
                startupLogger.LogInformation("Database migration and seed completed successfully.");
                break;
            }
            catch (Exception ex) when (attempt < 5)
            {
                startupLogger.LogWarning(ex,
                    "Migration attempt {Attempt}/5 failed. Retrying in 5s...", attempt);
                await Task.Delay(TimeSpan.FromSeconds(5));
            }
            catch (Exception ex)
            {
                startupLogger.LogError(ex,
                    "Database migration failed after 5 attempts. App will continue running.");
                break;
            }
        }

        startupLogger.LogInformation("App fully ready — accepting all requests.");
        await app.WaitForShutdownAsync();

        #endregion
    }

    /// <summary>
    /// Verifies that the tables EF migrations should have created actually
    /// exist. Logs a loud warning per missing table so the failure mode is
    /// visible in container logs instead of surfacing as cryptic 400s on
    /// every API call that touches the missing table.
    ///
    /// Doesn't throw — the app still starts and serves what it can. Add new
    /// tables here as you ship migrations that create them.
    /// </summary>
    private static async Task EnsureCriticalTablesExistAsync(
        BinMaps.Data.BinMapsDbContext db,
        Microsoft.Extensions.Logging.ILogger logger)
    {
        // Maps table → manual SQL fallback path (relative to repo root) so
        // ops can copy-paste the script into their SQL editor without
        // hunting for it. New tables: append below as new migrations land.
        var criticalTables = new[]
        {
            new { Table = "Areas",            Fallback = (string?)null },
            new { Table = "Trucks",           Fallback = (string?)null },
            new { Table = "TrashContainers",  Fallback = (string?)null },
            new { Table = "Reports",          Fallback = (string?)null },
            new { Table = "RouteRuns",        Fallback = (string?)"BinMaps.Data/Migrations/Manual/create-route-runs.sql" },
        };

        foreach (var t in criticalTables)
        {
            var exists = false;
            try
            {
                // OBJECT_ID returns NULL for missing tables. Fast and avoids
                // INFORMATION_SCHEMA which is sensitive to schema name.
                var connection = db.Database.GetDbConnection();
                if (connection.State != System.Data.ConnectionState.Open)
                    await connection.OpenAsync();
                using var cmd = connection.CreateCommand();
                cmd.CommandText = $"SELECT CAST(CASE WHEN OBJECT_ID(N'[dbo].[{t.Table}]', N'U') IS NULL THEN 0 ELSE 1 END AS BIT)";
                var result = await cmd.ExecuteScalarAsync();
                exists = result is bool b && b;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "Could not verify table [{Table}] exists; assuming OK.",
                    t.Table);
                continue;
            }

            if (exists)
            {
                logger.LogInformation("Schema check OK: [{Table}] exists.", t.Table);
            }
            else
            {
                if (t.Fallback is not null)
                {
                    logger.LogError(
                        "SCHEMA DRIFT: [{Table}] is MISSING — EF migrations did not create it. " +
                        "Run the manual SQL script `{Script}` against the database " +
                        "and restart the container. Until then, any feature that touches [{Table}] will 400.",
                        t.Table, t.Fallback, t.Table);
                }
                else
                {
                    logger.LogError(
                        "SCHEMA DRIFT: [{Table}] is MISSING. EF migrations are out of sync " +
                        "with the actual database schema. Investigate __EFMigrationsHistory.",
                        t.Table);
                }
            }
        }
    }
}
