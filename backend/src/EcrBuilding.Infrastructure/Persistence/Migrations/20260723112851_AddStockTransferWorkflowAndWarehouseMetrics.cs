using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStockTransferWorkflowAndWarehouseMetrics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ApproverUserId",
                table: "StockTransfers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BatchNo",
                table: "StockTransferLines",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "StockTransferLines",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReceivedQty",
                table: "StockTransferLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApproverUserId",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                table: "StockTransferLines");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "StockTransferLines");

            migrationBuilder.DropColumn(
                name: "ReceivedQty",
                table: "StockTransferLines");
        }
    }
}
