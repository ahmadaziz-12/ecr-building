using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnWorkflowModule6 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DamageReason",
                table: "Returns",
                type: "varchar(64)",
                maxLength: 64,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "DgrnNo",
                table: "Returns",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "ExchangeOrderId",
                table: "Returns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "GrossRefund",
                table: "Returns",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "NetCashback",
                table: "Returns",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PhotoReference",
                table: "Returns",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "RefundMethod",
                table: "Returns",
                type: "longtext",
                nullable: false)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "RefundSplitJson",
                table: "Returns",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "RestockingFeeAmount",
                table: "Returns",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "RestockingFeePct",
                table: "Returns",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "VatReversal",
                table: "Returns",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "OrderLineId",
                table: "ReturnLines",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StockQty",
                table: "ReturnLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPricePaid",
                table: "ReturnLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRate",
                table: "ReturnLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SurplusRestockingFeePct",
                table: "Categories",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateIndex(
                name: "IX_Returns_ExchangeOrderId",
                table: "Returns",
                column: "ExchangeOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnLines_OrderLineId",
                table: "ReturnLines",
                column: "OrderLineId");

            migrationBuilder.AddForeignKey(
                name: "FK_Returns_Orders_ExchangeOrderId",
                table: "Returns",
                column: "ExchangeOrderId",
                principalTable: "Orders",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Returns_Orders_ExchangeOrderId",
                table: "Returns");

            migrationBuilder.DropIndex(
                name: "IX_Returns_ExchangeOrderId",
                table: "Returns");

            migrationBuilder.DropIndex(
                name: "IX_ReturnLines_OrderLineId",
                table: "ReturnLines");

            migrationBuilder.DropColumn(
                name: "DamageReason",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "DgrnNo",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "ExchangeOrderId",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "GrossRefund",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "NetCashback",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "PhotoReference",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "RefundMethod",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "RefundSplitJson",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "RestockingFeeAmount",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "RestockingFeePct",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "VatReversal",
                table: "Returns");

            migrationBuilder.DropColumn(
                name: "OrderLineId",
                table: "ReturnLines");

            migrationBuilder.DropColumn(
                name: "StockQty",
                table: "ReturnLines");

            migrationBuilder.DropColumn(
                name: "UnitPricePaid",
                table: "ReturnLines");

            migrationBuilder.DropColumn(
                name: "VatRate",
                table: "ReturnLines");

            migrationBuilder.DropColumn(
                name: "SurplusRestockingFeePct",
                table: "Categories");
        }
    }
}
