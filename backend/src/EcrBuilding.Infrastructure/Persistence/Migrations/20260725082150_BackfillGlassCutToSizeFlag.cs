using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Data-only migration. Product.IsCutToSize was added by AddUomConversionEngine, which — like
    /// every ALTER TABLE onto an already-populated Products table — backfilled every existing row to
    /// false, silently overriding the seed script's intent (DbSeeder.cs: GLASS-6MM-CLR is defined
    /// "Cut-to-size by nature", IsCutToSize = true) for any database whose catalog was created before
    /// that migration ran. GLASS-6MM-CLR is the only product the seed script marks true, so this is a
    /// single, exact-SKU correction — unlike the ceiling/multiplier drift fixed elsewhere today, this
    /// field has a real working Edit SKU toggle (row-actions.ts), so it is NOT re-applied on every
    /// startup: a future admin's deliberate "false" must never be silently reverted back to true.
    /// </summary>
    public partial class BackfillGlassCutToSizeFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE Products SET IsCutToSize = 1 WHERE Sku = 'GLASS-6MM-CLR' AND IsCutToSize = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Irreversible data repair — the pre-migration false carried no information (see comment above).
        }
    }
}
