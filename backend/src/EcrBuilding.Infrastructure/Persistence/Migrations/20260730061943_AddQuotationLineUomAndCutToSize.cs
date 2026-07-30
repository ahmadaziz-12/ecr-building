using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQuotationLineUomAndCutToSize : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "HeightM",
                table: "QuotationLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LengthM",
                table: "QuotationLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MeasuredQty",
                table: "QuotationLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StockQty",
                table: "QuotationLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Uom",
                table: "QuotationLines",
                type: "longtext",
                nullable: false)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "WidthM",
                table: "QuotationLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            // Legacy rows predating this feature: StockQty defaults to 0 above, which every reader
            // (reservation/release/Convert) treats as "always in stock UOM" — backfill it to the only
            // value that was ever true before a UOM/cut-to-size selector existed on quotations.
            migrationBuilder.Sql("UPDATE QuotationLines SET StockQty = Qty WHERE StockQty = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HeightM",
                table: "QuotationLines");

            migrationBuilder.DropColumn(
                name: "LengthM",
                table: "QuotationLines");

            migrationBuilder.DropColumn(
                name: "MeasuredQty",
                table: "QuotationLines");

            migrationBuilder.DropColumn(
                name: "StockQty",
                table: "QuotationLines");

            migrationBuilder.DropColumn(
                name: "Uom",
                table: "QuotationLines");

            migrationBuilder.DropColumn(
                name: "WidthM",
                table: "QuotationLines");
        }
    }
}
