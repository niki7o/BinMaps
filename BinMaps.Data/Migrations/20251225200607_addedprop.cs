using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class addedprop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TrashType",
                table: "TrashContainers",
                newName: "TrashTypе");

            migrationBuilder.AddColumn<int>(
                name: "TrashType",
                table: "Trucks",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TrashType",
                table: "Trucks");

            migrationBuilder.RenameColumn(
                name: "TrashTypе",
                table: "TrashContainers",
                newName: "TrashType");
        }
    }
}
