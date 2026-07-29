using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStockCountReviewApprovalWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "StockCounts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RejectedAt",
                table: "StockCounts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RejectedByUserId",
                table: "StockCounts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                table: "StockCounts",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "ReviewedAt",
                table: "StockCounts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReviewedByUserId",
                table: "StockCounts",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_RejectedByUserId",
                table: "StockCounts",
                column: "RejectedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_ReviewedByUserId",
                table: "StockCounts",
                column: "ReviewedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_StockCounts_Users_RejectedByUserId",
                table: "StockCounts",
                column: "RejectedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockCounts_Users_ReviewedByUserId",
                table: "StockCounts",
                column: "ReviewedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockCounts_Users_RejectedByUserId",
                table: "StockCounts");

            migrationBuilder.DropForeignKey(
                name: "FK_StockCounts_Users_ReviewedByUserId",
                table: "StockCounts");

            migrationBuilder.DropIndex(
                name: "IX_StockCounts_RejectedByUserId",
                table: "StockCounts");

            migrationBuilder.DropIndex(
                name: "IX_StockCounts_ReviewedByUserId",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "RejectedAt",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "RejectedByUserId",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                table: "StockCounts");

            migrationBuilder.DropColumn(
                name: "ReviewedByUserId",
                table: "StockCounts");
        }
    }
}
