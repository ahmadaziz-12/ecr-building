using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase13ZatcaPerBranchIdentity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Moving from Model A (one shared company-wide identity row) to Model B (one row per
            // branch). The old singleton row has no meaningful BranchId to migrate to, and its
            // stored CSR/keys/CSIDs were tied to that shared identity anyway — clear it so the FK
            // below can be added cleanly. Each branch onboards fresh, independently, from here on.
            migrationBuilder.Sql("DELETE FROM ZatcaIdentities;");

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "ZatcaIdentities",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_ZatcaIdentities_BranchId",
                table: "ZatcaIdentities",
                column: "BranchId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ZatcaIdentities_Branches_BranchId",
                table: "ZatcaIdentities",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ZatcaIdentities_Branches_BranchId",
                table: "ZatcaIdentities");

            migrationBuilder.DropIndex(
                name: "IX_ZatcaIdentities_BranchId",
                table: "ZatcaIdentities");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "ZatcaIdentities");
        }
    }
}
