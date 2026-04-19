using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddContainerSoftDeleteAndSeeded : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "TrashContainers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedByUserId",
                table: "TrashContainers",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "TrashContainers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsSeeded",
                table: "TrashContainers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Containers_IsDeleted",
                table: "TrashContainers",
                column: "IsDeleted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Containers_IsDeleted",
                table: "TrashContainers");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "TrashContainers");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "TrashContainers");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "TrashContainers");

            migrationBuilder.DropColumn(
                name: "IsSeeded",
                table: "TrashContainers");
        }
    }
}
