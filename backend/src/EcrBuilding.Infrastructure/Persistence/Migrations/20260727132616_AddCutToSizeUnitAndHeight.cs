using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcrBuilding.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCutToSizeUnitAndHeight : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The RolePermissions restructure below is written as idempotent, guarded raw SQL rather
            // than the usual EF builder calls. MySQL DDL auto-commits per statement — it is NOT
            // rolled back if a later statement in the same "migration" fails — so a first attempt
            // that got partway through (e.g. the columns got added, then a later step failed) leaves
            // the database in a partial state that a second, non-idempotent attempt cannot cleanly
            // resume from ("Duplicate column" / "Duplicate entry" errors). Standard MySQL (unlike
            // MariaDB) has no "ADD COLUMN IF NOT EXISTS" shorthand, so each guard is a small dynamic
            // SQL block driven off INFORMATION_SCHEMA — portable across MySQL versions. Every
            // operation here is safe to run whether or not it already happened.
            AddColumnIfNotExists(migrationBuilder, "CanApprove", "tinyint(1) NOT NULL DEFAULT FALSE");
            AddColumnIfNotExists(migrationBuilder, "CanCreate", "tinyint(1) NOT NULL DEFAULT FALSE");
            AddColumnIfNotExists(migrationBuilder, "CanDelete", "tinyint(1) NOT NULL DEFAULT FALSE");
            AddColumnIfNotExists(migrationBuilder, "CanEdit", "tinyint(1) NOT NULL DEFAULT FALSE");
            AddColumnIfNotExists(migrationBuilder, "CanExport", "tinyint(1) NOT NULL DEFAULT FALSE");
            AddColumnIfNotExists(migrationBuilder, "CanView", "tinyint(1) NOT NULL DEFAULT FALSE");
            // DEFAULT '''' (4 quotes), not '' (2): this string is embedded inside a single-quoted SQL
            // literal that itself becomes the dynamic PREPARE statement text (see AddColumnIfNotExists
            // below) — two levels of string nesting. MySQL's `''`-escaping collapses one level, so it
            // takes 4 source quotes to leave a literal `''` (empty-string default) in the SQL PREPARE
            // actually executes. The previous 2-quote version left the PREPAREd ALTER TABLE with an
            // unterminated string literal, which is exactly the "near '''" syntax error this fixes.
            AddColumnIfNotExists(migrationBuilder, "ModuleKey", "varchar(100) CHARACTER SET utf8mb4 NOT NULL DEFAULT ''''");

            // Every existing row just got (or already has) ModuleKey = '' and Module/Level are being
            // dropped below, so every pre-existing RolePermission row is now indistinguishable
            // garbage under the new page-level schema (they'd all collide on (RoleId, '') in the
            // unique index right below). DbSeeder.EnsureExactlyFiveBrdRolesAsync rebuilds every
            // canonical role's full page grid from scratch on the very next startup
            // (HasCompletePageGrid detects the incomplete/empty-ModuleKey rows), so clearing the
            // table here is safe — nothing of value survives a truncate that wasn't already about to
            // be replaced.
            migrationBuilder.Sql("DELETE FROM `RolePermissions`;");

            // The new composite index must exist BEFORE the old one is dropped: InnoDB was using
            // IX_RolePermissions_RoleId_Module (leftmost column RoleId) to back
            // FK_RolePermissions_Roles_RoleId, since no separate single-column index on RoleId
            // exists. Dropping it first leaves the FK with no backing index and MySQL refuses the
            // DDL ("needed in a foreign key constraint").
            migrationBuilder.Sql(@"
                SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermissions' AND INDEX_NAME = 'IX_RolePermissions_RoleId_ModuleKey');
                SET @stmt = IF(@idx_exists = 0, 'CREATE UNIQUE INDEX `IX_RolePermissions_RoleId_ModuleKey` ON `RolePermissions` (`RoleId`, `ModuleKey`)', 'SELECT 1');
                PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
            migrationBuilder.Sql(@"
                SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermissions' AND INDEX_NAME = 'IX_RolePermissions_RoleId_Module');
                SET @stmt = IF(@idx_exists > 0, 'ALTER TABLE `RolePermissions` DROP INDEX `IX_RolePermissions_RoleId_Module`', 'SELECT 1');
                PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
            DropColumnIfExists(migrationBuilder, "Level");
            DropColumnIfExists(migrationBuilder, "Module");

            migrationBuilder.AddColumn<string>(
                name: "CutToSizeUnit",
                table: "Products",
                type: "longtext",
                nullable: false)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "HeightM",
                table: "OrderLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PermissionsEpochs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    Value = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PermissionsEpochs", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "UserPermissionOverrides",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    ModuleKey = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CanView = table.Column<bool>(type: "tinyint(1)", nullable: true),
                    CanCreate = table.Column<bool>(type: "tinyint(1)", nullable: true),
                    CanEdit = table.Column<bool>(type: "tinyint(1)", nullable: true),
                    CanDelete = table.Column<bool>(type: "tinyint(1)", nullable: true),
                    CanApprove = table.Column<bool>(type: "tinyint(1)", nullable: true),
                    CanExport = table.Column<bool>(type: "tinyint(1)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPermissionOverrides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPermissionOverrides_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_UserPermissionOverrides_UserId_ModuleKey",
                table: "UserPermissionOverrides",
                columns: new[] { "UserId", "ModuleKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PermissionsEpochs");

            migrationBuilder.DropTable(
                name: "UserPermissionOverrides");

            migrationBuilder.AddColumn<string>(
                name: "Level",
                table: "RolePermissions",
                type: "varchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Module",
                table: "RolePermissions",
                type: "varchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            // Same FK/index ordering constraint as Up(): the old composite index must exist BEFORE
            // the new one is dropped, since it's the only thing backing FK_RolePermissions_Roles_RoleId.
            migrationBuilder.CreateIndex(
                name: "IX_RolePermissions_RoleId_Module",
                table: "RolePermissions",
                columns: new[] { "RoleId", "Module" },
                unique: true);

            migrationBuilder.DropIndex(
                name: "IX_RolePermissions_RoleId_ModuleKey",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanApprove",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanCreate",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanDelete",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanEdit",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanExport",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CanView",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "ModuleKey",
                table: "RolePermissions");

            migrationBuilder.DropColumn(
                name: "CutToSizeUnit",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "HeightM",
                table: "OrderLines");
        }

        // Standard MySQL has no "ADD/DROP COLUMN IF [NOT] EXISTS" shorthand (that's a MariaDB
        // extension) — these drive a small dynamic-SQL guard off INFORMATION_SCHEMA.COLUMNS so the
        // RolePermissions restructure in Up() is safe to re-run after a partial failure (MySQL DDL
        // auto-commits per statement, so a failed migration can leave columns already added).
        private static void AddColumnIfNotExists(MigrationBuilder migrationBuilder, string columnName, string columnDefinitionSql)
        {
            // The ALTER is assembled as a MySQL string literal to hand to PREPARE, so every single
            // quote inside the column definition has to be doubled or it closes that literal early.
            // Without this, a string default of DEFAULT '' emitted ...DEFAULT ''' — which MySQL reads
            // as one escaped quote plus the closing quote, leaving an unterminated default and
            // failing the whole migration with "check the manual ... near '''".
            var definition = columnDefinitionSql.Replace("'", "''");
            migrationBuilder.Sql($@"
                SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermissions' AND COLUMN_NAME = '{columnName}');
                SET @stmt = IF(@col_exists = 0, 'ALTER TABLE `RolePermissions` ADD COLUMN `{columnName}` {definition}', 'SELECT 1');
                PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }

        private static void DropColumnIfExists(MigrationBuilder migrationBuilder, string columnName)
        {
            migrationBuilder.Sql($@"
                SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermissions' AND COLUMN_NAME = '{columnName}');
                SET @stmt = IF(@col_exists > 0, 'ALTER TABLE `RolePermissions` DROP COLUMN `{columnName}`', 'SELECT 1');
                PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }
    }
}
