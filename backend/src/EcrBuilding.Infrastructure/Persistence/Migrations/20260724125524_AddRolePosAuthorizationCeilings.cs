using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRolePosAuthorizationCeilings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CanAuthorizeDamagedReturns",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanAuthorizeStandardReturnWithoutReceipt",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanConfigureReturnRulesAndFees",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanManagePriceListAndUsers",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanManageSystemConfiguration",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanOverrideItemPrice",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanViewXReport",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanViewZReport",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanVoidTransactions",
                table: "Roles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountCeilingPercent",
                table: "Roles",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SurplusReturnCeilingAmount",
                table: "Roles",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CanAuthorizeDamagedReturns",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanAuthorizeStandardReturnWithoutReceipt",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanConfigureReturnRulesAndFees",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanManagePriceListAndUsers",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanManageSystemConfiguration",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanOverrideItemPrice",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanViewXReport",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanViewZReport",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanVoidTransactions",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "DiscountCeilingPercent",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "SurplusReturnCeilingAmount",
                table: "Roles");
        }
    }
}
