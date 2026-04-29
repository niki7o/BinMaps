-- ─────────────────────────────────────────────────────────────────────
-- Restore the accidentally hard-deleted seeded container #1.
--
-- Idempotent: checks first, inserts only if missing. Safe to run multiple
-- times. The same effect is also produced automatically on next API
-- restart by InitialStateSeeder (added to BinMaps.API/Seed/InitialStateSeeder.cs)
-- — this script is the manual escape hatch when restarting isn't an option.
--
-- Source of truth: BinMaps.API/Seed/containers.json, first row.
--
-- USAGE:
--   • Azure Portal → SQL database → Query editor → paste → Run
--   • Or:  sqlcmd -S <server> -d <db> -i restore-seed-container-1.sql
-- ─────────────────────────────────────────────────────────────────────

SET NOCOUNT ON;

-- 1. Sanity-check the parent area exists. The FK on AreaId → Areas.Id
--    would otherwise fail with a cryptic error. If this is empty, run
--    the area seed first (or restart the API once so the seeder runs).
IF NOT EXISTS (SELECT 1 FROM Areas WHERE Id = N'Зона 2 - Център')
BEGIN
    RAISERROR(
        'Area "Зона 2 - Център" not found. Restart the API once so InitialStateSeeder runs, or insert the Areas rows manually before re-running this script.',
        16, 1);
    RETURN;
END;

-- 2. Skip if container #1 already exists in any form (active OR
--    soft-deleted). Soft-deleted rows still occupy id=1 and must be
--    untouched — flip IsDeleted instead if recovery is the goal.
IF EXISTS (SELECT 1 FROM TrashContainers WHERE Id = 1)
BEGIN
    PRINT 'Container #1 already exists — nothing to restore.';

    -- If it exists but is soft-deleted, surface that fact so the operator
    -- can decide whether to flip IsDeleted instead of inserting.
    IF EXISTS (SELECT 1 FROM TrashContainers WHERE Id = 1 AND IsDeleted = 1)
    BEGIN
        PRINT 'Note: container #1 is soft-deleted. To recover, run:';
        PRINT '  UPDATE TrashContainers SET IsDeleted = 0, DeletedAt = NULL, DeletedByUserId = NULL WHERE Id = 1;';
    END;

    RETURN;
END;

-- 3. Insert. Values lifted directly from containers.json[0]; Status and
--    TrashType are HasConversion<string>() in BinMapsDbContext so we
--    write the enum *names*, not their integer values.
INSERT INTO TrashContainers (
    Id,
    AreaId,
    LocationX,
    LocationY,
    Capacity,
    TrashType,
    HasSensor,
    FillPercentage,
    Status,
    BatteryPercentage,
    Temperature,
    IsSeeded,
    IsDeleted,
    LastEmptiedAt,
    LastSensorReadAt,
    DeletedAt,
    DeletedByUserId
) VALUES (
    1,
    N'Зона 2 - Център',
    23.30502009430058,
    42.704171338632555,
    1100,
    N'Mixed',          -- TrashType enum 0 → 'Mixed'
    0,                 -- HasSensor=false
    0,                 -- FillPercentage starts at 0; FillageSimulator will adjust
    N'Active',
    NULL,              -- BatteryPercentage NULL because HasSensor=0
    NULL,              -- Temperature NULL because HasSensor=0
    1,                 -- IsSeeded=true so we don't lose this flag
    0,                 -- IsDeleted=false
    NULL,
    NULL,
    NULL,
    NULL
);

PRINT 'Container #1 restored.';
SELECT Id, AreaId, LocationX, LocationY, TrashType, Status, IsSeeded, IsDeleted
FROM TrashContainers WHERE Id = 1;
