using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    // Companion to NormalizeLegacyEnumValues: enum columns ALTERed onto tables that already had rows
    // were backfilled with '' by MySQL — unreadable by a strict enum parser and invisible to
    // WHERE-clause comparisons against real member names. The LegacyTolerantEnumConverter maps empty
    // to the enum's default member on read; this normalizes the known affected column at rest.
    public partial class NormalizeEmptyEnumValues : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE Customers SET LoyaltyTier = 'Bronze' WHERE LoyaltyTier = '' OR LoyaltyTier IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op: '' carried no information worth restoring.
        }
    }
}
