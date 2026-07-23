using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase10PosEnhancements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "PricingRules",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "DiscountType",
                table: "PricingRules",
                type: "varchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "Value",
                table: "PricingRules",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "OrderFees",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OrderId = table.Column<int>(type: "int", nullable: false),
                    Label = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Amount = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderFees", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderFees_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ParkedSales",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    TicketNo = table.Column<string>(type: "varchar(255)", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    BranchId = table.Column<int>(type: "int", nullable: false),
                    TerminalId = table.Column<int>(type: "int", nullable: true),
                    CashierUserId = table.Column<int>(type: "int", nullable: false),
                    CustomerId = table.Column<int>(type: "int", nullable: true),
                    Notes = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParkedSales", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ParkedSales_Branches_BranchId",
                        column: x => x.BranchId,
                        principalTable: "Branches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ParkedSales_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ParkedSales_Terminals_TerminalId",
                        column: x => x.TerminalId,
                        principalTable: "Terminals",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ParkedSales_Users_CashierUserId",
                        column: x => x.CashierUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ParkedSaleLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ParkedSaleId = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: false),
                    Qty = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParkedSaleLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ParkedSaleLines_ParkedSales_ParkedSaleId",
                        column: x => x.ParkedSaleId,
                        principalTable: "ParkedSales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ParkedSaleLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_OrderFees_OrderId",
                table: "OrderFees",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSaleLines_ParkedSaleId",
                table: "ParkedSaleLines",
                column: "ParkedSaleId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSaleLines_ProductId",
                table: "ParkedSaleLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_BranchId",
                table: "ParkedSales",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_CashierUserId",
                table: "ParkedSales",
                column: "CashierUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_CustomerId",
                table: "ParkedSales",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_TerminalId",
                table: "ParkedSales",
                column: "TerminalId");

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_TicketNo",
                table: "ParkedSales",
                column: "TicketNo",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderFees");

            migrationBuilder.DropTable(
                name: "ParkedSaleLines");

            migrationBuilder.DropTable(
                name: "ParkedSales");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "DiscountType",
                table: "PricingRules");

            migrationBuilder.DropColumn(
                name: "Value",
                table: "PricingRules");
        }
    }
}
