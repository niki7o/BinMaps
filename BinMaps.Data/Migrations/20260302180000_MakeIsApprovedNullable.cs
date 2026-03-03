using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BinMaps.Data.Migrations
{
    /// <inheritdoc />
    public partial class MakeIsApprovedNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Make IsApproved nullable:
            //   NULL  = pending (not yet reviewed by admin)
            //   true  = approved
            //   false = rejected
            migrationBuilder.AlterColumn<bool>(
                name: "IsApproved",
                table: "Reports",
                type: "bit",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "bit",
                oldNullable: false,
                oldDefaultValue: false);

            // All existing rows had IsApproved = false (non-nullable default).
            // Those that were auto-rejected by the old system should stay false.
            // But since the old system never correctly distinguished
            // pending from rejected, reset all false→null so they appear
            // as "Pending" and the admin can review them properly.
            migrationBuilder.Sql("UPDATE Reports SET IsApproved = NULL WHERE IsApproved = 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reverse: convert null→false before making non-nullable again
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
    }
}
