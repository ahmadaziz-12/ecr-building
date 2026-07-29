using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddApprovalCenterAndLabelTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RelatedOrderLineId",
                table: "ApprovalRequests",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRequests_RelatedOrderLineId",
                table: "ApprovalRequests",
                column: "RelatedOrderLineId");

            migrationBuilder.AddForeignKey(
                name: "FK_ApprovalRequests_OrderLines_RelatedOrderLineId",
                table: "ApprovalRequests",
                column: "RelatedOrderLineId",
                principalTable: "OrderLines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ApprovalRequests_OrderLines_RelatedOrderLineId",
                table: "ApprovalRequests");

            migrationBuilder.DropIndex(
                name: "IX_ApprovalRequests_RelatedOrderLineId",
                table: "ApprovalRequests");

            migrationBuilder.DropColumn(
                name: "RelatedOrderLineId",
                table: "ApprovalRequests");
        }
    }
}
