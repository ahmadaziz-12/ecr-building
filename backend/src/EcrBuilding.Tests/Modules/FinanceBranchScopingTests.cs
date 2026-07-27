using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Covers the 2026-07-25 "make dead filters functional" fix: the /finance/pricing and
/// /finance/tax-zatca "Branch" filters had no backing column at all (PricingRule/TaxCode were
/// always company-wide). Rather than remove the filter, PricingRule.BranchId/TaxCode.BranchId
/// (both nullable — null means company-wide, same convention as Expense/Return) were added so the
/// filter has something real to narrow on.
/// </summary>
public class FinanceBranchScopingTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Domain.Entities.Branch Branch, HttpClient Client) SeedFinanceContext()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "FinanceManager", fullAccessModules: [ModuleArea.Finance]);
        var user = TestDataSeeder.AddUser(db, role, "finance-manager@test.local", branchId: branch.Id);
        return (branch, _factory.CreateAuthenticatedClient(user));
    }

    [Fact]
    public async Task Pricing_rule_created_with_a_branch_reports_it_back_and_appears_in_the_list()
    {
        var (branch, client) = SeedFinanceContext();

        var create = await client.PostAsJsonAsync("/api/finance/pricing-rules", new
        {
            name = "Riyadh-only Cement Deal", type = "Quantity", scope = "SKU: CEM-OPC-50KG", condition = ">= 50 bags",
            action = "-8%", priority = 20, validUntil = (DateTime?)null, code = (string?)null,
            discountType = "Percentage", value = 8m, branchId = branch.Id,
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(branch.Id, created.GetProperty("branchId").GetInt32());
        Assert.Equal(branch.NameEn, created.GetProperty("branchName").GetString());

        var list = await client.GetFromJsonAsync<JsonElement[]>("/api/finance/pricing-rules");
        var listed = list!.Single(r => r.GetProperty("id").GetInt32() == created.GetProperty("id").GetInt32());
        Assert.Equal(branch.Id, listed.GetProperty("branchId").GetInt32());
    }

    [Fact]
    public async Task Pricing_rule_created_without_a_branch_is_company_wide()
    {
        var (_, client) = SeedFinanceContext();

        var create = await client.PostAsJsonAsync("/api/finance/pricing-rules", new
        {
            name = "Storewide Ramadan Promo", type = "Coupon", scope = "All branches", condition = "Any",
            action = "5% off", priority = 30, validUntil = (DateTime?)null, code = "RAM26",
            discountType = "Percentage", value = 5m, branchId = (int?)null,
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, created.GetProperty("branchId").ValueKind);
        Assert.Equal(JsonValueKind.Null, created.GetProperty("branchName").ValueKind);
    }

    [Fact]
    public async Task Pricing_rule_creation_rejects_an_unknown_branch_id()
    {
        var (_, client) = SeedFinanceContext();

        var create = await client.PostAsJsonAsync("/api/finance/pricing-rules", new
        {
            name = "Bad Branch Rule", type = "Fee", scope = "Any", condition = "Any", action = "+1%",
            priority = 1, validUntil = (DateTime?)null, code = (string?)null, discountType = "Percentage",
            value = 1m, branchId = 999_999,
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Tax_code_branch_is_set_on_create_and_can_be_changed_on_update()
    {
        var (branch, client) = SeedFinanceContext();
        using var db = _factory.CreateDbContext();
        var otherBranch = TestDataSeeder.AddBranch(db, code: "BR2", name: "Jeddah Branch");

        var create = await client.PostAsJsonAsync("/api/finance/tax-codes", new
        {
            code = "FEE-JED-DELIV", name = "Jeddah Delivery Fee", type = "Fee", rate = 60m,
            appliesTo = "Delivery orders", effectiveFrom = DateTime.UtcNow.Date, glAccountCode = (string?)null,
            branchId = branch.Id,
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(branch.Id, created.GetProperty("branchId").GetInt32());
        var id = created.GetProperty("id").GetInt32();

        // Re-scope it to a different branch on update.
        var update = await client.PutAsJsonAsync($"/api/finance/tax-codes/{id}", new
        {
            code = "FEE-JED-DELIV", name = "Jeddah Delivery Fee", type = "Fee", rate = 60m,
            appliesTo = "Delivery orders", effectiveFrom = DateTime.UtcNow.Date, glAccountCode = (string?)null,
            branchId = otherBranch.Id,
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(otherBranch.Id, updated.GetProperty("branchId").GetInt32());
        Assert.Equal(otherBranch.NameEn, updated.GetProperty("branchName").GetString());
    }

    [Fact]
    public async Task Tax_code_creation_rejects_an_unknown_branch_id()
    {
        var (_, client) = SeedFinanceContext();

        var create = await client.PostAsJsonAsync("/api/finance/tax-codes", new
        {
            code = "FEE-BAD", name = "Bad Branch Fee", type = "Fee", rate = 10m,
            appliesTo = "Any", effectiveFrom = DateTime.UtcNow.Date, glAccountCode = (string?)null,
            branchId = 999_999,
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }
}
