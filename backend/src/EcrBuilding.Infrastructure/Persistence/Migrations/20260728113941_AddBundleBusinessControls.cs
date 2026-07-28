using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBundleBusinessControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CreatedByUserId",
                table: "ProductBundles",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EligibleBranchIdsJson",
                table: "ProductBundles",
                type: "longtext",
                nullable: false,
                // MySQL backfills existing rows with '' for a NOT NULL text column added via ALTER —
                // an explicit default keeps BundleLifecycle's JsonSerializer.Deserialize call (which
                // expects valid JSON, not an empty string) from throwing on every pre-Phase-4 bundle.
                defaultValue: "[]")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "EligibleCustomerTypesJson",
                table: "ProductBundles",
                type: "longtext",
                nullable: false,
                defaultValue: "[]")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "EndDate",
                table: "ProductBundles",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "StackableDiscount",
                table: "ProductBundles",
                type: "tinyint(1)",
                nullable: false,
                // Entity default is true (bundles stack by default, matching pre-Phase-4 behavior
                // where nothing suppressed stacking) — existing rows must backfill the same way, not
                // MySQL's usual "false" backfill for a bare NOT NULL boolean.
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartDate",
                table: "ProductBundles",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "EligibleBranchIdsJson",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "EligibleCustomerTypesJson",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "EndDate",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "StackableDiscount",
                table: "ProductBundles");

            migrationBuilder.DropColumn(
                name: "StartDate",
                table: "ProductBundles");
        }
    }
}
