using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRouteRun : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RouteRuns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DriverId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    DriverName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    AreaId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    TrashType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TruckId = table.Column<int>(type: "int", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlannedDistanceKm = table.Column<double>(type: "float", nullable: false),
                    PlannedMinutes = table.Column<double>(type: "float", nullable: false),
                    CollectedLoad = table.Column<double>(type: "float", nullable: false),
                    StopsCompleted = table.Column<int>(type: "int", nullable: false),
                    StopsPlanned = table.Column<int>(type: "int", nullable: false),
                    StopsJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RouteRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RouteRuns_Areas_AreaId",
                        column: x => x.AreaId,
                        principalTable: "Areas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RouteRuns_Trucks_TruckId",
                        column: x => x.TruckId,
                        principalTable: "Trucks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RouteRuns_Area_StartedAt",
                table: "RouteRuns",
                columns: new[] { "AreaId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RouteRuns_Driver_StartedAt",
                table: "RouteRuns",
                columns: new[] { "DriverId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RouteRuns_StartedAt",
                table: "RouteRuns",
                column: "StartedAt");

            migrationBuilder.CreateIndex(
                name: "IX_RouteRuns_Status",
                table: "RouteRuns",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_RouteRuns_TruckId",
                table: "RouteRuns",
                column: "TruckId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RouteRuns");
        }
    }
}
