using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class fixedNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "FinalConficende",
                table: "Reports",
                newName: "FinalConfidence");

            migrationBuilder.RenameColumn(
                name: "Points",
                table: "AspNetUsers",
                newName: "Reputation");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "FinalConfidence",
                table: "Reports",
                newName: "FinalConficende");

            migrationBuilder.RenameColumn(
                name: "Reputation",
                table: "AspNetUsers",
                newName: "Points");
        }
    }
}
