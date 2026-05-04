using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <summary>
    /// Third attempt to guarantee the RouteRuns table exists in production.
    ///
    /// Why a third migration:
    ///   20260420120000_AddRouteRun — original; recorded in history on some
    ///     deployments but table never appeared (likely a Plesk snapshot issue).
    ///   20260429180000_FixRouteRunsTable — defensive SQL migration; may have
    ///     been recorded in __EFMigrationsHistory by the Program.cs self-heal
    ///     helper BEFORE the SQL actually ran, leaving EF convinced it's done
    ///     while the table is still missing.
    ///   THIS migration (20260505120000_EnsureRouteRunsV2) has a new ID that
    ///     is guaranteed NOT to be in the history, so EF will always run it.
    ///
    /// Key improvements over the previous attempt:
    ///   * Every migrationBuilder.Sql() call passes suppressTransaction:true so
    ///     individual index failures do NOT roll back the CREATE TABLE.
    ///   * The CREATE TABLE statement is separated from each CREATE INDEX so
    ///     SQL Server can auto-commit each DDL step independently.
    ///   * All guards remain fully idempotent (IF OBJECT_ID / IF NOT EXISTS).
    /// </summary>
    public partial class EnsureRouteRunsV2 : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── Table ─────────────────────────────────────────────────────────
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
", suppressTransaction: true);

            // ── Indexes (each in its own Sql call so one failure doesn't block the rest) ──
            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RouteRuns_Area_StartedAt'
      AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
)
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Area_StartedAt]
        ON [dbo].[RouteRuns] ([AreaId] ASC, [StartedAt] ASC);
", suppressTransaction: true);

            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RouteRuns_Driver_StartedAt'
      AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
)
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Driver_StartedAt]
        ON [dbo].[RouteRuns] ([DriverId] ASC, [StartedAt] ASC);
", suppressTransaction: true);

            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RouteRuns_StartedAt'
      AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
)
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_StartedAt]
        ON [dbo].[RouteRuns] ([StartedAt] ASC);
", suppressTransaction: true);

            // IX_RouteRuns_Status intentionally omitted:
            // Status is NVARCHAR(MAX) and SQL Server forbids indexing MAX columns.
            // Shrink the column to NVARCHAR(50) first so the index can be added.
            migrationBuilder.Sql(@"
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
      AND name = N'Status'
      AND max_length = -1   -- -1 = MAX
)
BEGIN
    ALTER TABLE [dbo].[RouteRuns]
        ALTER COLUMN [Status] NVARCHAR(50) NOT NULL;
END;
", suppressTransaction: true);

            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RouteRuns_Status'
      AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
)
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Status]
        ON [dbo].[RouteRuns] ([Status] ASC);
", suppressTransaction: true);

            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RouteRuns_TruckId'
      AND object_id = OBJECT_ID(N'[dbo].[RouteRuns]')
)
    CREATE NONCLUSTERED INDEX [IX_RouteRuns_TruckId]
        ON [dbo].[RouteRuns] ([TruckId] ASC);
", suppressTransaction: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally empty — the table ownership belongs to AddRouteRun.
            // Rolling back that migration drops the table; we don't need a second
            // DROP here.
        }
    }
}
