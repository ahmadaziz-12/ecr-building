using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Admin;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Persistence.Seed;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Module 4 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — realigns the role model to BRD §10.1's
/// Cashier/Senior Cashier/Supervisor/Store Manager/System Admin ladder with graduated numeric ceilings.
/// </summary>
public class Module4RoleCeilingsTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Seeded_roles_match_BRD_10_1_ceiling_table_exactly()
    {
        using var db = _factory.CreateDbContext();
        // Calls the role-seeding step directly (internal, exposed via InternalsVisibleTo) rather than
        // the full DbSeeder.SeedAsync — that also seeds branches/terminals/devices, which has a
        // Sqlite-vs-MySQL FK-ordering issue unrelated to what this test verifies.
        await DbSeeder.SeedRolesAsync(db);

        var roles = db.Roles.ToDictionary(r => r.Name);

        // Cashier: up to 5% discount, surplus returns up to SAR 500, no other authorizations.
        var cashier = roles["Cashier"];
        Assert.Equal(5m, cashier.DiscountCeilingPercent);
        Assert.Equal(500m, cashier.SurplusReturnCeilingAmount);
        Assert.False(cashier.CanAuthorizeStandardReturnWithoutReceipt);
        Assert.False(cashier.CanOverrideItemPrice);
        Assert.False(cashier.CanAuthorizeDamagedReturns);
        Assert.False(cashier.CanVoidTransactions);

        // Senior Cashier: up to 10% discount, surplus returns up to SAR 1,000, can authorize standard
        // returns without receipt and override item price (logged).
        var senior = roles["Senior Cashier"];
        Assert.Equal(10m, senior.DiscountCeilingPercent);
        Assert.Equal(1_000m, senior.SurplusReturnCeilingAmount);
        Assert.True(senior.CanAuthorizeStandardReturnWithoutReceipt);
        Assert.True(senior.CanOverrideItemPrice);
        Assert.False(senior.CanAuthorizeDamagedReturns);
        Assert.False(senior.CanVoidTransactions);

        // Supervisor: up to 15% discount, damaged returns + surplus returns of ANY value, void, X-report.
        var supervisor = roles["Supervisor"];
        Assert.Equal(15m, supervisor.DiscountCeilingPercent);
        Assert.Null(supervisor.SurplusReturnCeilingAmount);
        Assert.True(supervisor.CanAuthorizeDamagedReturns);
        Assert.True(supervisor.CanVoidTransactions);
        Assert.True(supervisor.CanViewXReport);
        Assert.False(supervisor.CanViewZReport);

        // Store Manager: unlimited discount, Z-reports, price list/user mgmt.
        var manager = roles["Store Manager"];
        Assert.Null(manager.DiscountCeilingPercent);
        Assert.Null(manager.SurplusReturnCeilingAmount);
        Assert.True(manager.CanViewZReport);
        Assert.True(manager.CanConfigureReturnRulesAndFees);
        Assert.True(manager.CanManagePriceListAndUsers);
        Assert.False(manager.CanManageSystemConfiguration);

        // System Admin: everything, including system configuration.
        var admin = roles["System Admin"];
        Assert.True(admin.CanManageSystemConfiguration);

        // Exactly the BRD's 5 roles — no legacy Owner/Admin/Branch Manager/Warehouse Staff roster.
        Assert.Equal(5, db.Roles.Count());
    }

    [Fact]
    public async Task Update_role_round_trips_pos_ceilings_and_page_permissions_through_the_real_endpoint()
    {
        // No Create endpoint exists anymore — the roster is a fixed 5, seeded up front; only Update.
        using var db = _factory.CreateDbContext();
        await DbSeeder.SeedRolesAsync(db);
        var branch = TestDataSeeder.AddBranch(db);
        var adminRole = TestDataSeeder.AddRole(db, "TestAdmin", fullAccessModules: ModuleArea.Admin);
        var adminUser = TestDataSeeder.AddUser(db, adminRole, "admin@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(adminUser);
        var supervisor = db.Roles.Single(r => r.Name == "Supervisor");

        var tightened = new PosCeilingsDto(12m, 800m, true, true, true, true, true, false, false, false, false);
        var permissions = new List<ModulePermissionEntry> { new("/finance/returns", true, false, true, false, true, true) };
        var updateResponse = await client.PutAsJsonAsync($"/api/admin/roles/{supervisor.Id}", new UpsertRoleRequest(
            "Promoted tier", 12_000m, permissions, tightened));

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = await updateResponse.Content.ReadFromJsonAsync<RoleDto>();
        Assert.NotNull(updated);
        Assert.Equal(12m, updated!.PosCeilings.DiscountCeilingPercent);
        Assert.Equal(12_000m, updated.ApprovalCap);
        var returnsPerm = updated.Permissions.Single(p => p.Module == "/finance/returns");
        Assert.True(returnsPerm.CanApprove);
        Assert.False(returnsPerm.CanCreate);
    }

    [Fact]
    public async Task Existing_module_permission_authorization_still_works_after_adding_pos_ceilings()
    {
        // Regression check: Role.PosCeilings fields must not disturb the page-permission
        // authorization path (RequireModuleAttribute / IPermissionResolver).
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouseRole = TestDataSeeder.AddRole(db, "Warehouse Staff", fullAccessModules: ModuleArea.Inventory);
        var warehouseUser = TestDataSeeder.AddUser(db, warehouseRole, "warehouse@test.local", branchId: branch.Id);
        TestDataSeeder.AddCategory(db);

        var client = _factory.CreateAuthenticatedClient(warehouseUser);

        var inventoryResponse = await client.GetAsync("/api/catalog/categories");
        Assert.Equal(HttpStatusCode.OK, inventoryResponse.StatusCode);

        var adminResponse = await client.GetAsync("/api/admin/roles");
        Assert.Equal(HttpStatusCode.Forbidden, adminResponse.StatusCode);
    }

    [Fact]
    public async Task Update_role_leaves_its_name_untouched_while_other_fields_stay_editable()
    {
        // A system role's Name is the natural key DbSeeder.EnsureExactlyFiveBrdRolesAsync matches on
        // to decide whether a canonical role already exists — UpsertRoleRequest deliberately carries
        // no Name field at all, so a rename is now structurally impossible via this endpoint, not just
        // rejected.
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var adminRole = TestDataSeeder.AddRole(db, "TestAdmin", fullAccessModules: ModuleArea.Admin);
        var adminUser = TestDataSeeder.AddUser(db, adminRole, "admin2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(adminUser);

        var systemRole = new Role { Name = "Cashier", ApprovalCap = 500m, IsSystem = true, Status = EntityStatus.Active };
        db.Roles.Add(systemRole);
        db.SaveChanges();

        var ceilings = new PosCeilingsDto(5m, 500m, false, false, false, false, false, false, false, false, false);
        var editAttempt = await client.PutAsJsonAsync($"/api/admin/roles/{systemRole.Id}", new UpsertRoleRequest(
            "Updated description", 750m, [], ceilings));
        Assert.Equal(HttpStatusCode.OK, editAttempt.StatusCode);
        var edited = await editAttempt.Content.ReadFromJsonAsync<RoleDto>();
        Assert.Equal("Cashier", edited!.Name);
        Assert.Equal(750m, edited.ApprovalCap);
        Assert.Equal("Updated description", edited.Description);
    }
}
