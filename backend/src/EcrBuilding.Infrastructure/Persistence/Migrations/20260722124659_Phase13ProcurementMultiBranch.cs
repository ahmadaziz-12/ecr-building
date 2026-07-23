using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase13ProcurementMultiBranch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_Branches_BranchId",
                table: "PurchaseOrders");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_BranchId",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "PurchaseOrders");

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "ReturnToSuppliers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "WarehouseId",
                table: "ReturnToSuppliers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitCost",
                table: "ReturnToSupplierLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Carrier",
                table: "PurchaseOrders",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "TrackingRef",
                table: "PurchaseOrders",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "BatchNo",
                table: "PurchaseOrderLines",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "PurchaseOrderLines",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "PurchaseOrderLines",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WarehouseId",
                table: "PurchaseOrderLines",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_ReturnToSuppliers_BranchId",
                table: "ReturnToSuppliers",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnToSuppliers_WarehouseId",
                table: "ReturnToSuppliers",
                column: "WarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_BranchId",
                table: "PurchaseOrderLines",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_WarehouseId",
                table: "PurchaseOrderLines",
                column: "WarehouseId");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrderLines_Branches_BranchId",
                table: "PurchaseOrderLines",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrderLines_Warehouses_WarehouseId",
                table: "PurchaseOrderLines",
                column: "WarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ReturnToSuppliers_Branches_BranchId",
                table: "ReturnToSuppliers",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ReturnToSuppliers_Warehouses_WarehouseId",
                table: "ReturnToSuppliers",
                column: "WarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrderLines_Branches_BranchId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrderLines_Warehouses_WarehouseId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropForeignKey(
                name: "FK_ReturnToSuppliers_Branches_BranchId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropForeignKey(
                name: "FK_ReturnToSuppliers_Warehouses_WarehouseId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropIndex(
                name: "IX_ReturnToSuppliers_BranchId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropIndex(
                name: "IX_ReturnToSuppliers_WarehouseId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrderLines_BranchId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrderLines_WarehouseId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropColumn(
                name: "WarehouseId",
                table: "ReturnToSuppliers");

            migrationBuilder.DropColumn(
                name: "UnitCost",
                table: "ReturnToSupplierLines");

            migrationBuilder.DropColumn(
                name: "Carrier",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "TrackingRef",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "WarehouseId",
                table: "PurchaseOrderLines");

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "PurchaseOrders",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_BranchId",
                table: "PurchaseOrders",
                column: "BranchId");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_Branches_BranchId",
                table: "PurchaseOrders",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
