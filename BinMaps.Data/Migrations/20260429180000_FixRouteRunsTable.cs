using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <summary>
    /// Defensive recreation of the RouteRuns table.
    ///
    /// Why this is a separate migration even though 20260420120000_AddRouteRun
    /// already does the same thing:
    ///   On at least one production database (Plesk-managed SQL Server) the
    ///   AddRouteRun migration is recorded in __EFMigrationsHistory but the
    ///   table itself does NOT exist — most likely because that production
    ///   db was restored from a snapshot that already had the history row,
    ///   or MigrateAsync silently failed in the middle of applying it.
    ///   Either way, MigrateAsync will never re-run AddRouteRun. Shipping
    ///   THIS migration with a new id forces EF to execute its Up() block
    ///   on next deploy.
    ///
    /// The Up() body is **idempotent raw SQL**: every CREATE is gated on
    /// `IF NOT EXISTS / IF OBJECT_ID(...) IS NULL` so it's safe whether
    /// the production schema already has the table (no-op) or is missing
    /// it (creates from scratch). No data is destroyed in either case.
    ///
    /// The schema below is byte-for-byte identical to AddRouteRun.Up().
    /// </summary>
    public partial class FixRouteRunsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Table — IF NOT EXISTS guard so this is safe on databases
            // where AddRouteRun did successfully apply.
            migrationBuilder.Sql(@"
IF OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RouteRuns] (
        [Id]                INT             IDENTITY(1,1) NOT NULL,
        [DriverId]          NVARCHAR(450)   NOT NULL,
        [DriverName]        NVARCHAR(256)   NOT NULL,
        [AreaId]            NVARCHAR(50)    NOT NULL,
        [TrashType]         NVARCHAR(MAX)   NOT NULL,
        [TruckId]           INT             NULL,
        [StartedAt]         DATETIME2       NOT NULL,
        [CompletedAt]       DATETIME2       NULL,
        [Status]            NVARCHAR(MAX)   NOT NULL,
        [PlannedDistanceKm] FLOAT           NOT NULL,
        [PlannedMinutes]    FLOAT           NOT NULL,
        [CollectedLoad]     FLOAT           NOT NULL,
        [StopsCompleted]    INT             NOT NULL,
        [StopsPlanned]      INT             NOT NULL,
        [StopsJson]         NVARCHAR(MAX)   NULL,
        CONSTRAINT [PK_RouteRuns] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_RouteRuns_Areas_AreaId]   FOREIGN KEY ([AreaId])
            REFERENCES [dbo].[Areas]  ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_RouteRuns_Trucks_TruckId] FOREIGN KEY ([TruckId])
            REFERENCES [dbo].[Trucks] ([Id]) ON DELETE SET NULL
    );
END;
");

            // Indexes — each guarded on its own so a partial creation
            // (table exists but missing indexes, e.g. from an interrupted
            // migration) self-heals.
            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Area_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Area_StartedAt]
        ON [dbo].[RouteRuns] ([AreaId] ASC, [StartedAt] ASC);
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Driver_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Driver_StartedAt]
        ON [dbo].[RouteRuns] ([DriverId] ASC, [StartedAt] ASC);
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_StartedAt' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_StartedAt]
        ON [dbo].[RouteRuns] ([StartedAt] ASC);
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_Status' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Status]
        ON [dbo].[RouteRuns] ([Status] ASC);
");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RouteRuns_TruckId' AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]'))
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_TruckId]
        ON [dbo].[RouteRuns] ([TruckId] ASC);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally empty: this is a defensive migration whose only
            // purpose is to align production schema with the model. Rolling
            // it back would mean dropping RouteRuns, which AddRouteRun's
            // Down() already does — let *that* migration own the destructive
            // path so we don't have two migrations both dropping the table.
        }
    }
}
