using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDeliveryOrderSplitLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SourceDeliveryOrderId",
                table: "DeliveryOrders",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryOrders_SourceDeliveryOrderId",
                table: "DeliveryOrders",
                column: "SourceDeliveryOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_DeliveryOrders_DeliveryOrders_SourceDeliveryOrderId",
                table: "DeliveryOrders",
                column: "SourceDeliveryOrderId",
                principalTable: "DeliveryOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DeliveryOrders_DeliveryOrders_SourceDeliveryOrderId",
                table: "DeliveryOrders");

            migrationBuilder.DropIndex(
                name: "IX_DeliveryOrders_SourceDeliveryOrderId",
                table: "DeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SourceDeliveryOrderId",
                table: "DeliveryOrders");
        }
    }
}
