using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTerminalKioskAndOperator : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "KioskLockdownPinHash",
                table: "Terminals",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "KioskLockdownPinLength",
                table: "Terminals",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "KioskLockdownPinSetAt",
                table: "Terminals",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PairingSecretHash",
                table: "Terminals",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "PairingSecretSetAt",
                table: "Terminals",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BehaviorProfile",
                table: "Devices",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "BranchId",
                table: "Devices",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SyncStatus",
                table: "Devices",
                type: "varchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "Synced")
                .Annotation("MySql:CharSet", "utf8mb4");

            // Backfill BranchId for existing devices from their terminal's branch before the
            // NOT NULL FK is enforced below (the defaultValue: 0 above has no real branch behind it).
            migrationBuilder.Sql(
                "UPDATE Devices d JOIN Terminals t ON d.TerminalId = t.Id SET d.BranchId = t.BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Terminals_OperatorUserId",
                table: "Terminals",
                column: "OperatorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_BranchId",
                table: "Devices",
                column: "BranchId");

            migrationBuilder.AddForeignKey(
                name: "FK_Devices_Branches_BranchId",
                table: "Devices",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Terminals_Users_OperatorUserId",
                table: "Terminals",
                column: "OperatorUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Devices_Branches_BranchId",
                table: "Devices");

            migrationBuilder.DropForeignKey(
                name: "FK_Terminals_Users_OperatorUserId",
                table: "Terminals");

            migrationBuilder.DropIndex(
                name: "IX_Terminals_OperatorUserId",
                table: "Terminals");

            migrationBuilder.DropIndex(
                name: "IX_Devices_BranchId",
                table: "Devices");

            migrationBuilder.DropColumn(
                name: "KioskLockdownPinHash",
                table: "Terminals");

            migrationBuilder.DropColumn(
                name: "KioskLockdownPinLength",
                table: "Terminals");

            migrationBuilder.DropColumn(
                name: "KioskLockdownPinSetAt",
                table: "Terminals");

            migrationBuilder.DropColumn(
                name: "PairingSecretHash",
                table: "Terminals");

            migrationBuilder.DropColumn(
                name: "PairingSecretSetAt",
                table: "Terminals");

            migrationBuilder.DropColumn(
                name: "BehaviorProfile",
                table: "Devices");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "Devices");

            migrationBuilder.DropColumn(
                name: "SyncStatus",
                table: "Devices");
        }
    }
}
