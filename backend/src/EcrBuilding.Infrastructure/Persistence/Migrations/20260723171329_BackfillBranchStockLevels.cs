using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BackfillBranchStockLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Databases that already existed before BranchStockLevel was introduced never got a row
            // seeded per product/branch (DbSeeder only seeds an empty database) — without this,
            // checkout has nothing to deduct from for every branch on every existing install. Flat
            // starter quantity; a fresh `dotnet run` against an empty DB still gets DbSeeder's
            // randomized amounts instead, this only backfills what's missing.
            migrationBuilder.Sql(@"
                INSERT INTO BranchStockLevels (ProductId, BranchId, OnHand, Reserved, CreatedAt, UpdatedAt)
                SELECT p.Id, b.Id, 15, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
                FROM Products p
                CROSS JOIN Branches b
                WHERE NOT EXISTS (
                    SELECT 1 FROM BranchStockLevels bsl WHERE bsl.ProductId = p.Id AND bsl.BranchId = b.Id
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
