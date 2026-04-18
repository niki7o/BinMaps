using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportLocationAndMissingContainerType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "LocationX",
                table: "Reports",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "LocationY",
                table: "Reports",
                type: "float",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LocationX",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "LocationY",
                table: "Reports");
        }
    }
}
