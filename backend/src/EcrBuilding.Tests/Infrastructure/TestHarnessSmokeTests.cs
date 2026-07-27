using System.Net;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Tests.Infrastructure;

/// <summary>
/// Proves the Module 0 test harness works end-to-end: real Api pipeline, private SQLite database,
/// real JWT auth/authorization enforcement. Later modules' tests follow this same shape — see
/// docs/BRD-GAP-IMPLEMENTATION-PLAN.md Module 0 for the pattern this establishes.
/// </summary>
public class TestHarnessSmokeTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Authenticated_user_with_inventory_view_can_list_categories()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: ModuleArea.Inventory);
        var user = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        TestDataSeeder.AddCategory(db);

        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.GetAsync("/api/catalog/categories");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_request_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        TestDataSeeder.AddCategory(db);

        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/catalog/categories");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task User_without_module_permission_is_forbidden()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        // Role has no Inventory permission at all — should be rejected by RequireModuleAttribute.
        var role = TestDataSeeder.AddRole(db, "DeliveryOnly", fullAccessModules: ModuleArea.Delivery);
        var user = TestDataSeeder.AddUser(db, role, "driver@test.local", branchId: branch.Id);

        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.GetAsync("/api/catalog/categories");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
