-- ─────────────────────────────────────────────────────────────────────
-- Manual creation of the RouteRuns table.
--
-- WHY THIS EXISTS: the EF migration 20260420120000_AddRouteRun did not
-- apply on the production database (most likely cause: the migration file
-- shipped after the database had already been created from an older
-- snapshot, leaving __EFMigrationsHistory misaligned with the actual
-- schema, OR Database.MigrateAsync silently failed across all 5 retries
-- on first deploy and was never re-attempted).
--
-- Symptoms it fixes:
--   • POST /api/trucks/route/start → 400 "Invalid object name 'RouteRuns'"
--   • Live driver tracking empty (no run rows can be created)
--   • Маршрути / История panel always empty
--
-- IDEMPOTENT: safe to run repeatedly. Skips creation if the table or
-- migration record already exists.
--
-- USAGE:
--   • Azure Portal → SQL database → Query editor → paste → Run
--   • Or:  sqlcmd -S <server> -d <db> -i create-route-runs.sql
--
-- After running this, restart the API container ONCE so the in-process
-- EF model cache picks up the new schema. The next /route/start call
-- should then return 200 with a runId.
-- ─────────────────────────────────────────────────────────────────────

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- 1. Schema check: bail early if the table already exists.
IF OBJECT_ID(N'[dbo].[RouteRuns]', N'U') IS NOT NULL
BEGIN
    PRINT 'RouteRuns table already exists — skipping table creation.';
END
ELSE
BEGIN
    PRINT 'Creating RouteRuns table...';

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
        CONSTRAINT [FK_RouteRuns_Areas_AreaId]  FOREIGN KEY ([AreaId])
            REFERENCES [dbo].[Areas]  ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_RouteRuns_Trucks_TruckId] FOREIGN KEY ([TruckId])
            REFERENCES [dbo].[Trucks] ([Id]) ON DELETE SET NULL
    );

    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Area_StartedAt]
        ON [dbo].[RouteRuns] ([AreaId] ASC, [StartedAt] ASC);

    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Driver_StartedAt]
        ON [dbo].[RouteRuns] ([DriverId] ASC, [StartedAt] ASC);

    CREATE NONCLUSTERED INDEX [IX_RouteRuns_StartedAt]
        ON [dbo].[RouteRuns] ([StartedAt] ASC);

    CREATE NONCLUSTERED INDEX [IX_RouteRuns_Status]
        ON [dbo].[RouteRuns] ([Status] ASC);

    CREATE NONCLUSTERED INDEX [IX_RouteRuns_TruckId]
        ON [dbo].[RouteRuns] ([TruckId] ASC);

    PRINT 'RouteRuns table created.';
END;

-- 2. Tell EF this migration is "applied" so MigrateAsync() doesn't try
--    to re-run it on next API startup (which would fail because the
--    table now already exists).
IF NOT EXISTS (
    SELECT 1 FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260420120000_AddRouteRun'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260420120000_AddRouteRun', N'8.0.13');
    PRINT 'Recorded migration 20260420120000_AddRouteRun in __EFMigrationsHistory.';
END
ELSE
BEGIN
    PRINT 'Migration 20260420120000_AddRouteRun already in __EFMigrationsHistory.';
END;

COMMIT TRANSACTION;

-- 3. Verify.
SELECT
    name        AS TableName,
    object_id   AS ObjectId,
    create_date AS CreatedAt
FROM sys.tables
WHERE name = N'RouteRuns';

SELECT MigrationId, ProductVersion
FROM [__EFMigrationsHistory]
WHERE MigrationId = N'20260420120000_AddRouteRun';

PRINT 'Done. Restart the API container once so the EF model cache refreshes.';
