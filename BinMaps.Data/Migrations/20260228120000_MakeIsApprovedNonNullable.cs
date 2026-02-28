using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class MakeIsApprovedNonNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Patch any NULL values that were left over from the old nullable column
            migrationBuilder.Sql("UPDATE Reports SET IsApproved = 0 WHERE IsApproved IS NULL");

            migrationBuilder.AlterColumn<bool>(
                name: "IsApproved",
                table: "Reports",
                type: "bit",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "bit",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<bool>(
                name: "IsApproved",
                table: "Reports",
                type: "bit",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "bit");
        }
    }
}
