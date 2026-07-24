using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchStockLevelAndTransferBranches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "ToWarehouseId",
                table: "StockTransfers",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "FromWarehouseId",
                table: "StockTransfers",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<int>(
                name: "FromBranchId",
                table: "StockTransfers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ToBranchId",
                table: "StockTransfers",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BranchStockLevels",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ProductId = table.Column<int>(type: "int", nullable: false),
                    BranchId = table.Column<int>(type: "int", nullable: false),
                    OnHand = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    Reserved = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BranchStockLevels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BranchStockLevels_Branches_BranchId",
                        column: x => x.BranchId,
                        principalTable: "Branches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BranchStockLevels_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_FromBranchId",
                table: "StockTransfers",
                column: "FromBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_ToBranchId",
                table: "StockTransfers",
                column: "ToBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BranchStockLevels_BranchId",
                table: "BranchStockLevels",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BranchStockLevels_ProductId_BranchId",
                table: "BranchStockLevels",
                columns: new[] { "ProductId", "BranchId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_StockTransfers_Branches_FromBranchId",
                table: "StockTransfers",
                column: "FromBranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockTransfers_Branches_ToBranchId",
                table: "StockTransfers",
                column: "ToBranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockTransfers_Branches_FromBranchId",
                table: "StockTransfers");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransfers_Branches_ToBranchId",
                table: "StockTransfers");

            migrationBuilder.DropTable(
                name: "BranchStockLevels");

            migrationBuilder.DropIndex(
                name: "IX_StockTransfers_FromBranchId",
                table: "StockTransfers");

            migrationBuilder.DropIndex(
                name: "IX_StockTransfers_ToBranchId",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "FromBranchId",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ToBranchId",
                table: "StockTransfers");

            migrationBuilder.AlterColumn<int>(
                name: "ToWarehouseId",
                table: "StockTransfers",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "FromWarehouseId",
                table: "StockTransfers",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
