using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase12ZatcaRealIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CrNumber",
                table: "ZatcaSettingsList",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Uuid",
                table: "ZatcaInvoices",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    FriendlyName = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Xml = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            // ZatcaEnvironment's members were renamed to match ZATCA's own environment names
            // (Simulate -> NonProduction, Sandbox -> Simulation); the column is a plain string, so
            // existing rows carry the old literal names and must be rewritten in place.
            migrationBuilder.Sql(@"
                UPDATE ZatcaIdentities SET Environment = 'NonProduction' WHERE Environment = 'Simulate';
                UPDATE ZatcaIdentities SET Environment = 'Simulation' WHERE Environment = 'Sandbox';
            ");

            // ZatcaService now calls ZATCA's real e-invoicing gateway instead of a local
            // simulator — any previously "onboarded" identity was signed with a locally-generated,
            // never-registered key and is worthless against the real gateway. Reset onboarding so
            // it must be completed for real from the ZATCA Phase 2 Settings page.
            migrationBuilder.Sql(@"
                UPDATE ZatcaIdentities SET
                    Csr = NULL, PrivateKeyPem = NULL,
                    ComplianceRequestId = NULL, ComplianceToken = NULL, ComplianceSecret = NULL,
                    ProductionRequestId = NULL, ProductionToken = NULL, ProductionSecret = NULL,
                    OnboardingStatus = 'NotStarted', Phase2Enabled = 0, LastIcv = 0,
                    LastInvoiceHash = 'NWZlY2VmYjEwMDMwYzc1NGY4OTVhMDU0YTJhOGFmMTU=';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE ZatcaIdentities SET Environment = 'Simulate' WHERE Environment = 'NonProduction';
                UPDATE ZatcaIdentities SET Environment = 'Sandbox' WHERE Environment = 'Simulation';
            ");

            migrationBuilder.DropTable(
                name: "DataProtectionKeys");

            migrationBuilder.DropColumn(
                name: "CrNumber",
                table: "ZatcaSettingsList");

            migrationBuilder.DropColumn(
                name: "Uuid",
                table: "ZatcaInvoices");
        }
    }
}
