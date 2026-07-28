using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Finance &gt; Pricing previously only supported Create + status transitions (Approve/Expire/
/// Reactivate) — there was no way to fix a typo or retire a mistaken rule without leaving it to
/// Expire forever. PUT does a full field update; DELETE is a genuine hard delete since nothing
/// references a PricingRule by id (order/quotation lines only ever copy its Value at sale time).
/// </summary>
public class PricingRuleCrudTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object UpsertRequest(string name = "Cement Pallet Deal", decimal value = 8m) => new
    {
        name, type = "Quantity", scope = "SKU: CEM-OPC-50KG", condition = ">= 50 bags", action = $"-{value}%",
        priority = 20, validUntil = (DateTime?)null, code = (string?)null, discountType = "Percentage", value,
        minQuantity = 50m, sku = "CEM-OPC-50KG",
    };

    private HttpClient ClientWithFinanceLevel(AppDbContext db, AccessLevel level, string email)
    {
        var role = TestDataSeeder.AddRoleWithLevels(db, $"Finance-{level}-{Guid.NewGuid():N}", (ModuleArea.Finance, level));
        var user = TestDataSeeder.AddUser(db, role, email);
        return _factory.CreateAuthenticatedClient(user);
    }

    [Fact]
    public async Task Editing_a_pending_rule_updates_its_fields_and_leaves_it_pending()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Old Name", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-5%", Priority = 20, Status = PricingRuleStatus.PendingApproval,
            DiscountType = RuleDiscountType.Percentage, Value = 5m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = ClientWithFinanceLevel(db, AccessLevel.Edit, "editor1@test.local");

        var response = await client.PutAsJsonAsync($"/api/finance/pricing-rules/{rule.Id}", UpsertRequest(name: "New Name", value: 12m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("New Name", body.GetProperty("name").GetString());
        Assert.Equal(12m, body.GetProperty("value").GetDecimal());
        Assert.Equal("PendingApproval", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Editing_an_active_rule_sends_it_back_to_pending_approval()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Live Rule", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = ClientWithFinanceLevel(db, AccessLevel.Edit, "editor2@test.local");

        var response = await client.PutAsJsonAsync($"/api/finance/pricing-rules/{rule.Id}", UpsertRequest(value: 15m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(15m, body.GetProperty("value").GetDecimal());
        Assert.Equal("PendingApproval", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Deleting_a_rule_removes_it_from_the_list()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Disposable Rule", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Expired,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        // Delete is its own page-level action now (PermissionAction.Delete), granted only at Full —
        // Edit alone (Create/Edit/Export) is deliberately not enough, unlike the old ordinal model
        // where any Edit-or-above level could hit every mutating endpoint on the controller.
        var client = ClientWithFinanceLevel(db, AccessLevel.Full, "editor3@test.local");

        var deleteResponse = await client.DeleteAsync($"/api/finance/pricing-rules/{rule.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var listResponse = await client.GetFromJsonAsync<JsonElement>("/api/finance/pricing-rules");
        Assert.DoesNotContain(listResponse.EnumerateArray(), r => r.GetProperty("id").GetInt32() == rule.Id);
    }

    [Fact]
    public async Task View_only_finance_user_cannot_edit_or_delete_a_rule()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Protected Rule", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = ClientWithFinanceLevel(db, AccessLevel.View, "viewer1@test.local");

        var editResponse = await client.PutAsJsonAsync($"/api/finance/pricing-rules/{rule.Id}", UpsertRequest());
        var deleteResponse = await client.DeleteAsync($"/api/finance/pricing-rules/{rule.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, editResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deleteResponse.StatusCode);
    }
}
