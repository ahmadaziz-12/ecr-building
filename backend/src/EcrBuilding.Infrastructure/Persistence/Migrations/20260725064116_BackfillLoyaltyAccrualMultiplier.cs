using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Data-only migration. The migration that added Category.LoyaltyAccrualMultiplier backfilled
    /// existing rows with 0 rather than the entity default of 1, which silently turned loyalty
    /// accrual OFF for every pre-existing category (points = eligible SAR × multiplier). 0 was never
    /// a value anyone could have chosen at the time (the column predates any UI for it), so every
    /// 0 is a backfill artifact — normalize to the standard 1× rate. Categories created or edited
    /// after this migration keep whatever an admin sets, including a deliberate 0.
    /// </summary>
    public partial class BackfillLoyaltyAccrualMultiplier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE Categories SET LoyaltyAccrualMultiplier = 1 WHERE LoyaltyAccrualMultiplier = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Irreversible data repair — the pre-migration zeros carried no information.
        }
    }
}
