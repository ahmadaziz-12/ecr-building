using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLoyaltyTiersAndBundleSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "ProductBundles",
                type: "varchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "BundleId",
                table: "OrderLines",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AccountManagerUserId",
                table: "Customers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LoyaltyLifetimeSpend",
                table: "Customers",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "PriorityBilling",
                table: "Customers",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_OrderLines_BundleId",
                table: "OrderLines",
                column: "BundleId");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_AccountManagerUserId",
                table: "Customers",
                column: "AccountManagerUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Customers_Users_AccountManagerUserId",
                table: "Customers",
                column: "AccountManagerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OrderLines_ProductBundles_BundleId",
                table: "OrderLines",
                column: "BundleId",
                principalTable: "ProductBundles",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Customers_Users_AccountManagerUserId",
                table: "Customers");

            migrationBuilder.DropForeignKey(
                name: "FK_OrderLines_ProductBundles_BundleId",
                table: "OrderLines");

            migrationBuilder.DropIndex(
                name: "IX_OrderLines_BundleId",
                table: "OrderLines");

            migrationBuilder.DropIndex(
                name: "IX_Customers_AccountManagerUserId",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "BundleId",
                table: "OrderLines");

            migrationBuilder.DropColumn(
                name: "AccountManagerUserId",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "LoyaltyLifetimeSpend",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "PriorityBilling",
                table: "Customers");
        }
    }
}
