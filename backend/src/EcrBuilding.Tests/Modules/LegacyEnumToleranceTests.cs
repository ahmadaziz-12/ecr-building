using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Regression for the live-data outage of 2026-07-25: enums are stored as member-name strings, so
/// Module 7's Standard→Bronze rename made every customer row written by the older build unreadable —
/// /api/pos/customers 500'd and the whole app showed zero customers. The LegacyTolerantEnumConverter
/// + EnumLegacyAliases must keep such rows readable forever.
/// </summary>
public class LegacyEnumToleranceTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Customer_rows_stored_with_the_pre_rename_tier_name_still_read_and_map_to_Bronze()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var customer = TestDataSeeder.AddCustomer(db, nameEn: "Legacy Row Customer");
        // Simulate a row written by the pre-Module-7 build: the old member name, raw in the column.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE Customers SET LoyaltyTier = 'Standard' WHERE Id = {customer.Id}");
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: ModuleArea.Orders);
        var user = TestDataSeeder.AddUser(db, role, "legacy-enum@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.GetAsync("/api/pos/customers");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var customers = await response.Content.ReadFromJsonAsync<JsonElement>();
        var legacy = customers.EnumerateArray().Single(c => c.GetProperty("nameEn").GetString() == "Legacy Row Customer");
        Assert.Equal("Bronze", legacy.GetProperty("loyaltyTier").GetString());
    }

    [Fact]
    public async Task Empty_enum_cells_from_column_backfills_read_as_the_enum_default()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var customer = TestDataSeeder.AddCustomer(db, nameEn: "Backfilled Row Customer");
        // MySQL backfills NOT NULL text columns with '' when an enum column is ALTERed onto a
        // populated table — must read as the enum's default member (Bronze), never crash.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE Customers SET LoyaltyTier = '' WHERE Id = {customer.Id}");
        var role = TestDataSeeder.AddRole(db, "Cashier2", fullAccessModules: ModuleArea.Orders);
        var user = TestDataSeeder.AddUser(db, role, "empty-enum@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.GetAsync("/api/pos/customers");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var customers = await response.Content.ReadFromJsonAsync<JsonElement>();
        var backfilled = customers.EnumerateArray().Single(c => c.GetProperty("nameEn").GetString() == "Backfilled Row Customer");
        Assert.Equal("Bronze", backfilled.GetProperty("loyaltyTier").GetString());
    }

    [Fact]
    public async Task A_truly_unknown_enum_value_fails_with_an_instructive_error_not_a_silent_default()
    {
        using var db = _factory.CreateDbContext();
        var customer = TestDataSeeder.AddCustomer(db, nameEn: "Corrupt Row Customer");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE Customers SET LoyaltyTier = 'NotARealTier' WHERE Id = {customer.Id}");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => db.Customers.AsNoTracking().FirstAsync(c => c.Id == customer.Id));
        Assert.Contains("EnumLegacyAliases", ex.Message);
    }
}
