using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsBanned",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "BanReason",
                table: "AspNetUsers",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BannedAt",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IsBanned",   table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "BanReason",  table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "BannedAt",   table: "AspNetUsers");
        }
    }
}
