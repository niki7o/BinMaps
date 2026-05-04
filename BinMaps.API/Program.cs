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
            // Prevents "Conflicting schemaIds" crash when two types in
            // different namespaces share the same simple name.
            o.CustomSchemaIds(t => t.FullName?.Replace("+", ".") ?? t.Name);

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

        // ── Step 1: pre-heal critical schema ─────────────────────────────
        // Run BEFORE MigrateAsync so a broken migration history can't
        // prevent the heal from happening. Idempotent — harmless when the
        // tables already exist. This is the bulletproof path: even if
        // every migration fails, the API still has the schema it needs.
        try
        {
            using var preHealScope = app.Services.CreateScope();
            var preHealDb = preHealScope.ServiceProvider.GetRequiredService<BinMapsDbContext>();
            startupLogger.LogInformation("Pre-migration schema heal starting...");
            await EnsureCriticalTablesExistAsync(preHealDb, startupLogger);
            startupLogger.LogInformation("Pre-migration schema heal finished.");
        }
        catch (Exception ex)
        {
            // We deliberately don't rethrow — even if heal fails, the
            // migration retry below might still recover. We've logged the
            // error; the per-table heal logging inside is much more useful
            // anyway.
            startupLogger.LogError(ex,
                "Pre-migration schema heal threw at the outer level. Continuing to MigrateAsync.");
        }

        // ── Step 2: standard EF migrations + seed ────────────────────────
        // Now that the critical tables definitely exist, MigrateAsync can
        // safely apply any *other* outstanding migrations (e.g. column
        // additions, index changes) without tripping over RouteRuns being
        // the missing piece.
        for (int attempt = 1; attempt <= 5; attempt++)
        {
            try
            {
                startupLogger.LogInformation("Migration attempt {Attempt}/5 starting...", attempt);
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<BinMapsDbContext>();
                await db.Database.MigrateAsync();

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
                    "Database migration failed after 5 attempts. App will continue running " +
                    "(pre-migration schema heal already created critical tables).");
                break;
            }
        }

        // ── Step 3: post-migration verification ──────────────────────────
        // Belt-and-suspenders. If MigrateAsync did something weird (e.g.
        // dropped a table, partial apply), this re-checks and re-heals.
        try
        {
            using var verifyScope = app.Services.CreateScope();
            var verifyDb = verifyScope.ServiceProvider.GetRequiredService<BinMapsDbContext>();
            await EnsureCriticalTablesExistAsync(verifyDb, startupLogger);
        }
        catch (Exception ex)
        {
            startupLogger.LogError(ex, "Post-migration schema verification threw at the outer level.");
        }

        startupLogger.LogInformation("App fully ready — accepting all requests.");
        await app.WaitForShutdownAsync();

        #endregion
    }

    /// <summary>
    /// Verifies that the tables EF migrations should have created actually
    /// exist — and self-heals when they don't.
    ///
    /// Why self-heal: in some hosting environments (Plesk-managed SQL
    /// Server we've seen, partial migration failures, history-table drift
    /// after a snapshot restore) MigrateAsync silently does the wrong
    /// thing: it records a migration as applied without actually creating
    /// the schema, OR it skips a needed migration because the history
    /// table thinks it's already done. Either way the symptom is the same:
    /// requests that touch the missing table 400 forever with
    /// "Invalid object name 'X'".
    ///
    /// We can't always fix MigrateAsync (no DB shell access on managed
    /// hosts). But we *can* run idempotent CREATE-IF-NOT-EXISTS SQL
    /// directly from app startup — same effect, no migration roundtrip.
    /// If the table already exists, the SQL no-ops. If not, we create it.
    /// Either way the next request succeeds.
    ///
    /// Each heal SQL string is executed in its own ExecuteSqlRawAsync call
    /// so an index failure doesn't roll back the CREATE TABLE that preceded
    /// it. We deliberately do NOT manipulate __EFMigrationsHistory here —
    /// history entries are owned by the migration files (specifically
    /// 20260505120000_EnsureRouteRunsV2) so MigrateAsync can track state
    /// correctly on future cold starts.
    ///
    /// Doesn't throw — the app still starts and serves what it can.
    /// </summary>
    private static async Task EnsureCriticalTablesExistAsync(
        BinMaps.Data.BinMapsDbContext db,
        Microsoft.Extensions.Logging.ILogger logger)
    {
        // (table, per-statement heal SQLs). null heal = no auto-create
        // (the table is part of the original Identity/seed migration that
        // *must* exist before this app makes sense; if any of these are
        // missing, the database is empty and an admin needs to intervene).
        var criticalTables = new (string Table, string[]? HealSqls)[]
        {
            ("Areas",           null),
            ("Trucks",          null),
            ("TrashContainers", null),
            ("Reports",         null),
            ("RouteRuns",       RouteRunsHealSqls),
        };

        foreach (var (table, healSqls) in criticalTables)
        {
            var exists = await TableExistsAsync(db, table, logger);

            if (exists)
            {
                logger.LogInformation("Schema check OK: [{Table}] exists.", table);
                continue;
            }

            if (healSqls is null)
            {
                logger.LogError(
                    "SCHEMA DRIFT: [{Table}] is MISSING and has no auto-heal SQL. " +
                    "The database appears empty or fundamentally broken — manual intervention required.",
                    table);
                continue;
            }

            logger.LogWarning(
                "SCHEMA DRIFT: [{Table}] is MISSING. Running {Count} inline self-heal statements...",
                table, healSqls.Length);

            // Execute each DDL statement independently so a failing index
            // creation doesn't roll back the CREATE TABLE that ran before it.
            foreach (var sql in healSqls)
            {
                try
                {
                    await db.Database.ExecuteSqlRawAsync(sql);
                }
                catch (Exception ex)
                {
                    // Log and keep going — the next statement may still succeed.
                    logger.LogError(ex,
                        "Self-heal statement for [{Table}] failed (continuing with remaining statements).",
                        table);
                }
            }

            var nowExists = await TableExistsAsync(db, table, logger);
            if (nowExists)
                logger.LogInformation(
                    "Self-heal succeeded: [{Table}] now exists.", table);
            else
                logger.LogError(
                    "Self-heal SQL ran but [{Table}] still missing — " +
                    "check DB user permissions (CREATE TABLE may be denied).",
                    table);
        }
    }

    private static async Task<bool> TableExistsAsync(
        BinMaps.Data.BinMapsDbContext db,
        string table,
        Microsoft.Extensions.Logging.ILogger logger)
    {
        try
        {
            var connection = db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
                await connection.OpenAsync();
            using var cmd = connection.CreateCommand();
            cmd.CommandText =
                $"SELECT CAST(CASE WHEN OBJECT_ID(N'[dbo].[{table}]', N'U') IS NULL THEN 0 ELSE 1 END AS BIT)";
            var result = await cmd.ExecuteScalarAsync();
            // SQL Server BIT → .NET bool via Microsoft.Data.SqlClient
            return result is true || (result is byte b && b == 1);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Could not verify table [{Table}] exists; assuming OK.", table);
            return true; // fail-open: don't break startup if the probe itself fails
        }
    }

    /// <summary>
    /// Individual idempotent DDL statements for the RouteRuns table + 5
    /// indexes. Executed one-by-one so a failing index doesn't undo the
    /// CREATE TABLE. Mirrors the schema in AddRouteRun + EnsureRouteRunsV2.
    /// </summary>
    private static readonly string[] RouteRunsHealSqls =
    [
        // 1. Table — no FK constraints in this statement: FKs are the most
        //    common failure point on restricted hosting (constraint names
        //    already exist from a partial migration, or user lacks REFERENCES
        //    permission). FKs are added separately below; EF doesn't need them.
        @"IF OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RouteRuns] (
        [Id]                INT             IDENTITY(1,1) NOT NULL,
        [DriverId]          NVARCHAR(450)   NOT NULL,
        [DriverName]        NVARCHAR(256)   NOT NULL,
        [AreaId]            NVARCHAR(50)    NOT NULL,
        [TrashType]         NVARCHAR(50)    NOT NULL,
        [TruckId]           INT             NULL,
        [StartedAt]         DATETIME2       NOT NULL,
        [CompletedAt]       DATETIME2       NULL,
        [Status]            NVARCHAR(50)    NOT NULL,
        [PlannedDistanceKm] FLOAT           NOT NULL,
        [PlannedMinutes]    FLOAT           NOT NULL,
        [CollectedLoad]     FLOAT           NOT NULL,
        [StopsCompleted]    INT             NOT NULL,
        [StopsPlanned]      INT             NOT NULL,
        [StopsJson]         NVARCHAR(MAX)   NULL,
        CONSTRAINT [PK_RouteRuns] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END;",

        // 2–6. Indexes — each in its own statement so one failure doesn't block the others
        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Area_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Area_StartedAt] ON [dbo].[RouteRuns] ([AreaId] ASC, [StartedAt] ASC);",

        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Driver_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Driver_StartedAt] ON [dbo].[RouteRuns] ([DriverId] ASC, [StartedAt] ASC);",

        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_StartedAt] ON [dbo].[RouteRuns] ([StartedAt] ASC);",

        // Shrink Status to NVARCHAR(50) first — MAX columns can't be index keys.
        @"IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[RouteRuns]') AND name = N'Status' AND max_length = -1
)
    ALTER TABLE [dbo].[RouteRuns] ALTER COLUMN [Status] NVARCHAR(50) NOT NULL;",

        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Status' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Status] ON [dbo].[RouteRuns] ([Status] ASC);",

        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_TruckId' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_TruckId] ON [dbo].[RouteRuns] ([TruckId] ASC);",

        // 7–8. FK constraints — separate statements so a failure here
        //      (constraint name clash, REFERENCES permission denied) does NOT
        //      prevent the table and indexes above from being usable.
        @"IF OBJECT_ID(N'FK_RouteRuns_Areas_AreaId', N'F') IS NULL
   AND OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NOT NULL
   AND OBJECT_ID(N'[dbo].[Areas]', N'U') IS NOT NULL
    ALTER TABLE [dbo].[RouteRuns]
        ADD CONSTRAINT [FK_RouteRuns_Areas_AreaId]
        FOREIGN KEY ([AreaId]) REFERENCES [dbo].[Areas]([Id]) ON DELETE NO ACTION;",

        @"IF OBJECT_ID(N'FK_RouteRuns_Trucks_TruckId', N'F') IS NULL
   AND OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NOT NULL
   AND OBJECT_ID(N'[dbo].[Trucks]', N'U') IS NOT NULL
    ALTER TABLE [dbo].[RouteRuns]
        ADD CONSTRAINT [FK_RouteRuns_Trucks_TruckId]
        FOREIGN KEY ([TruckId]) REFERENCES [dbo].[Trucks]([Id]) ON DELETE SET NULL;",
    ];
}
