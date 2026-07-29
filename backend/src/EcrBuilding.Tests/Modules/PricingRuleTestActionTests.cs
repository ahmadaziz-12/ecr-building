using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// The Pricing/Discounts/Coupons grid's row-level "Test" action (POST
/// /api/finance/pricing-rules/{id}/test) — previously undeclared on the backend, so clicking it in
/// the UI always fell through to ModulePage's generic "isn't wired up yet" toast. It doesn't run a
/// fake sale; it checks the same things that silently stop a rule from ever firing at checkout
/// (PendingApproval, an expired/future date window, a required field missing) and reports a
/// pass/fail plus a plain-language description of what the rule does, matching
/// CreatePricingRuleDialog's own live preview text.
/// </summary>
public class PricingRuleTestActionTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private HttpClient EditorClient(AppDbContext db, string email = "editor@test.local")
    {
        var role = TestDataSeeder.AddRoleWithLevels(db, $"Finance-Edit-{Guid.NewGuid():N}", (ModuleArea.Finance, AccessLevel.Edit));
        var user = TestDataSeeder.AddUser(db, role, email);
        return _factory.CreateAuthenticatedClient(user);
    }

    [Fact]
    public async Task An_active_quantity_rule_with_its_threshold_set_passes()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Sku = "CEM-OPC-50KG",
            Status = PricingRuleStatus.Active, DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m,
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = EditorClient(db);

        var response = await client.PostAsync($"/api/finance/pricing-rules/{rule.Id}/test", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("passed").GetBoolean());
        var message = body.GetProperty("messages")[0].GetString();
        Assert.Contains("50", message);
        Assert.Contains("8", message);
    }

    [Fact]
    public async Task A_rule_still_pending_approval_fails_with_the_reason_why()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "New Contractor Discount", Type = "Trade Tier", Scope = "Contractor customers",
            Status = PricingRuleStatus.PendingApproval, DiscountType = RuleDiscountType.Percentage, Value = 10m,
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = EditorClient(db);

        var response = await client.PostAsync($"/api/finance/pricing-rules/{rule.Id}/test", null);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("passed").GetBoolean());
        Assert.Contains(body.GetProperty("messages").EnumerateArray().Select(m => m.GetString()),
            m => m!.Contains("approval"));
    }

    [Fact]
    public async Task An_active_coupon_missing_its_code_fails()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Broken Coupon", Type = "Coupon", Scope = "All branches", Code = null,
            Status = PricingRuleStatus.Active, DiscountType = RuleDiscountType.Percentage, Value = 15m,
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = EditorClient(db);

        var response = await client.PostAsync($"/api/finance/pricing-rules/{rule.Id}/test", null);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("passed").GetBoolean());
    }

    [Fact]
    public async Task A_rule_past_its_valid_until_date_fails_even_if_marked_active()
    {
        using var db = _factory.CreateDbContext();
        var rule = new PricingRule
        {
            Name = "Expired Promo", Type = "Promotional", Scope = "All products",
            Status = PricingRuleStatus.Active, DiscountType = RuleDiscountType.Percentage, Value = 20m,
            ValidUntil = DateTime.UtcNow.AddDays(-1),
        };
        db.PricingRules.Add(rule);
        db.SaveChanges();
        var client = EditorClient(db);

        var response = await client.PostAsync($"/api/finance/pricing-rules/{rule.Id}/test", null);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("passed").GetBoolean());
    }

    [Fact]
    public async Task An_unknown_rule_id_returns_not_found()
    {
        using var db = _factory.CreateDbContext();
        var client = EditorClient(db);

        var response = await client.PostAsync("/api/finance/pricing-rules/999999/test", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
