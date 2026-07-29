using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRemnants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ConsumedRemnantId",
                table: "OrderLines",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Remnants",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ProductId = table.Column<int>(type: "int", nullable: false),
                    BranchId = table.Column<int>(type: "int", nullable: false),
                    Qty = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    LengthM = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    WidthM = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    HeightM = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    Status = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    SourceOrderLineId = table.Column<int>(type: "int", nullable: true),
                    DiscountPct = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    Notes = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Remnants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Remnants_Branches_BranchId",
                        column: x => x.BranchId,
                        principalTable: "Branches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Remnants_OrderLines_SourceOrderLineId",
                        column: x => x.SourceOrderLineId,
                        principalTable: "OrderLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Remnants_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_OrderLines_ConsumedRemnantId",
                table: "OrderLines",
                column: "ConsumedRemnantId");

            migrationBuilder.CreateIndex(
                name: "IX_Remnants_BranchId",
                table: "Remnants",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Remnants_ProductId",
                table: "Remnants",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_Remnants_SourceOrderLineId",
                table: "Remnants",
                column: "SourceOrderLineId");

            migrationBuilder.AddForeignKey(
                name: "FK_OrderLines_Remnants_ConsumedRemnantId",
                table: "OrderLines",
                column: "ConsumedRemnantId",
                principalTable: "Remnants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OrderLines_Remnants_ConsumedRemnantId",
                table: "OrderLines");

            migrationBuilder.DropTable(
                name: "Remnants");

            migrationBuilder.DropIndex(
                name: "IX_OrderLines_ConsumedRemnantId",
                table: "OrderLines");

            migrationBuilder.DropColumn(
                name: "ConsumedRemnantId",
                table: "OrderLines");
        }
    }
}
