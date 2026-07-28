using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPricingRuleAdvancedTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BuyQty",
                table: "PricingRules",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "FreeQty",
                table: "PricingRules",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MinCartTotal",
                table: "PricingRules",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PalletQty",
                table: "PricingRules",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BuyQty",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "FreeQty",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "MinCartTotal",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "PalletQty",
                table: "PricingRules");
        }
    }
}
