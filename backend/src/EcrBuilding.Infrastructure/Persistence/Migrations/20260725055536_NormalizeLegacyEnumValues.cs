using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    // Data-only migration: enums are stored as member-name strings (AppDbContext), so Module 7's
    // LoyaltyTier.Standard → Bronze rename stranded "Standard" in existing rows — old rows failed to
    // deserialize AND WHERE comparisons against the new name missed them. The
    // LegacyTolerantEnumConverter keeps reads alive; this normalizes the data at rest.
    // RULE: every future rename of a database-stored enum member ships one of these plus an
    // EnumLegacyAliases entry.
    public partial class NormalizeLegacyEnumValues : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE Customers SET LoyaltyTier = 'Bronze' WHERE LoyaltyTier = 'Standard';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE Customers SET LoyaltyTier = 'Standard' WHERE LoyaltyTier = 'Bronze';");
        }
    }
}
