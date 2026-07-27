using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Finance &gt; Pricing's Trade Tier / Quantity rules drove POS checkout math (PricingRuleCheckoutTests)
/// but were never read by QuotationsController at all — a quotation always used the hardcoded 5%
/// contractor default and never checked per-SKU Quantity thresholds, so a rule configured on the
/// Pricing page silently didn't apply the moment the same product was quoted instead of sold at the
/// till. All test products use SellingPrice=100, VatRate=0 so totals reduce to plain arithmetic.
/// </summary>
public class QuotationPricingRuleTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private sealed record Context(AppDbContext Db, Branch Branch, Product Product, HttpClient Client);

    private Context SeedContext(string sku = "CEM-OPC-50KG")
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: sku, sellingPrice: 100m, vatRate: 0m);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, $"quote-pricing-{Guid.NewGuid():N}@test.local", branchId: branch.Id);
        return new Context(db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object CreateRequest(int branchId, int? customerId, int productId, decimal qty) => new
    {
        branchId, customerId, lines = new[] { new { productId, qty } }, projectCode = "PRJ-1", customerReference = "REF-1",
    };

    [Fact]
    public async Task Active_quantity_rule_auto_applies_to_a_quotation_line_with_no_manual_discount()
    {
        var ctx = SeedContext();
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = $"SKU: {ctx.Product.Sku}", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = ctx.Product.Sku,
        });
        ctx.Db.SaveChanges();

        // 50 bags x 100 x (1 - 8%) = 4,600, with no discountPct passed in the request at all.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 50m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(4_600m, body.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(8m, body.GetProperty("lines")[0].GetProperty("discountPct").GetDecimal());
    }

    [Fact]
    public async Task Quantity_rule_matches_the_products_sku_case_insensitively_on_a_quotation()
    {
        var ctx = SeedContext(sku: "Net12");
        // Sku is uppercased at rule-creation time (PricingRulesController.Create) — the catalog SKU
        // itself is stored exactly as entered ("Net12"), so the match must ignore case.
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "NetWire Deal", Type = "Quantity", Scope = "SKU: Net12", Condition = ">= 1 units",
            Action = "-20%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m, MinQuantity = 1m, Sku = "NET12",
        });
        ctx.Db.SaveChanges();

        // 1 unit x 100 x (1 - 20%) = 80.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(80m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Active_trade_tier_rule_overrides_the_default_5_percent_for_a_contractor_quotation()
    {
        var ctx = SeedContext();
        var contractor = TestDataSeeder.AddCustomer(ctx.Db, type: CustomerType.Contractor);
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "VIP Contractor Rate", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any",
            Action = "-20% list", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m,
        });
        ctx.Db.SaveChanges();

        // 1 unit x 100 x (1 - 20%) = 80, not the hardcoded default of 95.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, contractor.Id, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(80m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Quantity_rule_scoped_to_a_different_sku_does_not_leak_onto_this_quotation_line()
    {
        var ctx = SeedContext(sku: "STEEL-RBR-12MM");
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        });
        ctx.Db.SaveChanges();

        // 50 units of a DIFFERENT sku — the cement-specific rule must not apply: 50 x 100 = 5,000.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 50m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(5_000m, body.GetProperty("grandTotal").GetDecimal());
    }
}
