using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// BRD §5.1/§6.2 — "Trade Tier" and "Quantity" rows on the Finance &gt; Pricing page must actually
/// drive checkout math, not just sit in the admin grid as decoration. Before this fix, the contractor
/// discount was a hardcoded 5% (OrdersController.ContractorDiscountPct) regardless of what a manager
/// configured in a "Trade Tier" PricingRule, and "Quantity" rules were never read at all.
///
/// All test products use SellingPrice=100, VatRate=0 so GrandTotal reduces to a plain qty*(1-pct)
/// calculation, keeping expected payment totals trivial to compute by hand.
/// </summary>
public class PricingRuleCheckoutTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Product product) SeedBranchAndProduct(AppDbContext db, string sku = "CEM-OPC-50KG", decimal onHand = 1_000m)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: sku, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch, onHand);
        TestDataSeeder.AddStandardGlAccounts(db);
        return (branch, product);
    }

    private static object CheckoutRequest(int branchId, int? customerId, int productId, decimal qty, decimal payAmount) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId,
        type = "Retail",
        lines = new[] { new { productId, qty } },
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null,
        manualDiscount = (object?)null,
        customFees = (object?)null,
        notes = (string?)null,
    };

    [Fact]
    public async Task Active_trade_tier_rule_overrides_the_default_5_percent_contractor_discount()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var contractor = TestDataSeeder.AddCustomer(db, type: CustomerType.Contractor);
        db.PricingRules.Add(new PricingRule
        {
            Name = "VIP Contractor Rate", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any",
            Action = "-20% list", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m,
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-tt@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 100 - 20% = 80, not the hardcoded default of 95.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, contractor.Id, product.Id, qty: 1m, payAmount: 80m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Expired_trade_tier_rule_is_ignored_and_no_automatic_contractor_discount_applies()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var contractor = TestDataSeeder.AddCustomer(db, type: CustomerType.Contractor);
        db.PricingRules.Add(new PricingRule
        {
            Name = "Expired Contractor Promo", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any",
            Action = "-25% list", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 25m, ValidUntil = DateTime.UtcNow.AddDays(-1),
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-tt2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Expired rule must not apply, and there is no hardcoded fallback anymore — full price (100).
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, contractor.Id, product.Id, qty: 1m, payAmount: 100m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Quantity_rule_auto_applies_once_the_line_reaches_its_threshold()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        db.PricingRules.Add(new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = $"SKU: {product.Sku}", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = product.Sku,
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-qty@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 50 bags x 100 x (1 - 8%) = 4,600.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 50m, payAmount: 4_600m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Quantity_rule_does_not_apply_below_its_threshold()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        db.PricingRules.Add(new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = $"SKU: {product.Sku}", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = product.Sku,
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-qty2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Only 10 bags — below the 50-bag threshold, so no discount at all: 10 x 100 = 1,000.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 10m, payAmount: 1_000m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Quantity_rule_scoped_to_a_different_sku_does_not_leak_onto_this_product()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db, sku: "STEEL-REBAR-12MM");
        db.PricingRules.Add(new PricingRule
        {
            Name = "Cement Pallet Deal", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags",
            Action = "-8%", Priority = 20, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 8m, MinQuantity = 50m, Sku = "CEM-OPC-50KG",
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-qty3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 50 units of a DIFFERENT sku — the cement-specific rule must not apply: 50 x 100 = 5,000.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 50m, payAmount: 5_000m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Quantity_rule_matches_the_products_sku_case_insensitively()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db, sku: "Net12");
        // Sku is uppercased at rule-creation time (PricingRulesController.Create) — the catalog SKU
        // itself is stored exactly as entered ("Net12"), so an ordinal comparison would never match.
        db.PricingRules.Add(new PricingRule
        {
            Name = "NetWire Deal", Type = "Quantity", Scope = "SKU: Net12", Condition = ">= 1 units",
            Action = "-20%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m, MinQuantity = 1m, Sku = "NET12",
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-case@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 1 unit x 100 x (1 - 20%) = 80.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 80m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }
}
