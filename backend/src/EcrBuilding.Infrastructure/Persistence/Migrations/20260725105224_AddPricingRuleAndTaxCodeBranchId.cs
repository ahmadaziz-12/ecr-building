using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPricingRuleAndTaxCodeBranchId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "TaxCodes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "PricingRules",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaxCodes_BranchId",
                table: "TaxCodes",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_PricingRules_BranchId",
                table: "PricingRules",
                column: "BranchId");

            migrationBuilder.AddForeignKey(
                name: "FK_PricingRules_Branches_BranchId",
                table: "PricingRules",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_TaxCodes_Branches_BranchId",
                table: "TaxCodes",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PricingRules_Branches_BranchId",
                table: "PricingRules");

            migrationBuilder.DropForeignKey(
                name: "FK_TaxCodes_Branches_BranchId",
                table: "TaxCodes");

            migrationBuilder.DropIndex(
                name: "IX_TaxCodes_BranchId",
                table: "TaxCodes");

            migrationBuilder.DropIndex(
                name: "IX_PricingRules_BranchId",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "TaxCodes");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "PricingRules");
        }
    }
}
