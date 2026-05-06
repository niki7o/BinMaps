using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <summary>
    /// Data-only migration: corrects container rows whose AreaId does not match
    /// their seeded geographic coordinates.
    ///
    /// Root cause: the initial containers.json had copy-paste errors that
    /// assigned several northern-Sofia containers to "Зона 5 - Юг и Витоша"
    /// (a southern zone) and one western-zone container to "Зона 4 - Овча Купел"
    /// with an eastern longitude.  The result was route stops appearing in a
    /// completely different zone on the Leaflet map.
    ///
    /// Corrections applied (IdempotentQuery — only updates rows still carrying
    /// the wrong zone):
    ///
    ///   #106  lat=42.712  lng=23.301  Zone 5 → Zone 3 (Люлин, western-north)
    ///   #108  lat=42.729  lng=23.322  Zone 5 → Zone 1 (Надежда север)
    ///   #110  lat=42.700  lng=23.312  Zone 5 → Zone 1 (Надежда север)
    ///   #115  lat=42.713  lng=23.328  Zone 5 → Zone 1 (Надежда север)
    ///   #117  lat=42.706  lng=23.289  Zone 5 → Zone 3 (Люлин, western-north)
    ///   #122  lat=42.700  lng=23.369  Zone 5 → Zone 6 (Изток, eastern)
    ///   #123  lat=42.688  lng=23.354  Zone 4 → Zone 6 (Изток, eastern)
    /// </summary>
    public partial class FixContainerZoneAssignments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Zone 5 containers with northern coordinates → Zone 3 (Люлин)
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 3 - Люлин'
WHERE  [Id] IN (106, 117)
  AND  [AreaId] = N'Зона 5 - Юг и Витоша';
", suppressTransaction: false);

            // Zone 5 containers with northern coordinates → Zone 1 (Надежда север)
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 1 - Надежда север'
WHERE  [Id] IN (108, 110, 115)
  AND  [AreaId] = N'Зона 5 - Юг и Витоша';
", suppressTransaction: false);

            // Zone 5 container with eastern coordinates → Zone 6 (Изток)
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 6 - Изток'
WHERE  [Id] = 122
  AND  [AreaId] = N'Зона 5 - Юг и Витоша';
", suppressTransaction: false);

            // Zone 4 container with eastern longitude → Zone 6 (Изток)
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 6 - Изток'
WHERE  [Id] = 123
  AND  [AreaId] = N'Зона 4 - Овча Купел';
", suppressTransaction: false);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reverse the corrections if this migration is rolled back.
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 5 - Юг и Витоша'
WHERE  [Id] IN (106, 117, 108, 110, 115, 122)
  AND  [AreaId] IN (N'Зона 3 - Люлин', N'Зона 1 - Надежда север', N'Зона 6 - Изток');
");
            migrationBuilder.Sql(@"
UPDATE [dbo].[TrashContainers]
SET    [AreaId] = N'Зона 4 - Овча Купел'
WHERE  [Id] = 123
  AND  [AreaId] = N'Зона 6 - Изток';
");
        }
    }
}
