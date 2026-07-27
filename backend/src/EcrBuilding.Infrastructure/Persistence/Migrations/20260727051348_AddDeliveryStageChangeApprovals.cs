using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDeliveryStageChangeApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Payload",
                table: "ApprovalRequests",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "RelatedDeliveryOrderId",
                table: "ApprovalRequests",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRequests_RelatedDeliveryOrderId",
                table: "ApprovalRequests",
                column: "RelatedDeliveryOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_ApprovalRequests_DeliveryOrders_RelatedDeliveryOrderId",
                table: "ApprovalRequests",
                column: "RelatedDeliveryOrderId",
                principalTable: "DeliveryOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ApprovalRequests_DeliveryOrders_RelatedDeliveryOrderId",
                table: "ApprovalRequests");

            migrationBuilder.DropIndex(
                name: "IX_ApprovalRequests_RelatedDeliveryOrderId",
                table: "ApprovalRequests");

            migrationBuilder.DropColumn(
                name: "Payload",
                table: "ApprovalRequests");

            migrationBuilder.DropColumn(
                name: "RelatedDeliveryOrderId",
                table: "ApprovalRequests");
        }
    }
}
