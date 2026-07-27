using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// BRD §7 — genuinely distinct Contractor/Wholesale/Project list prices (CR-038, not a discount off
/// SellingPrice), Promotional auto-applied date-ranged discounts (CR-040), and a permission-gated
/// per-line manual price override (CR-039, distinct from a discount).
///
/// All test products use SellingPrice=100, VatRate=0 so GrandTotal reduces to a plain
/// qty*unitPrice*(1-pct) calculation, keeping expected payment totals trivial to compute by hand.
/// </summary>
public class PriceListsAndPromoPricingTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Product product) SeedBranchAndProduct(AppDbContext db, string sku = "CEM-OPC-50KG")
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: sku, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        return (branch, product);
    }

    private static object CheckoutRequest(int branchId, int? customerId, int productId, decimal qty, decimal payAmount, object? extraLine = null, int? priceOverrideApprovalId = null) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId,
        type = "Retail",
        lines = new[] { extraLine ?? new { productId, qty } },
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null,
        manualDiscount = (object?)null,
        customFees = (object?)null,
        notes = (string?)null,
        priceOverrideApprovalRequestId = priceOverrideApprovalId,
    };

    [Theory]
    [InlineData(PriceListType.Contractor, 70)]
    [InlineData(PriceListType.Wholesale, 60)]
    [InlineData(PriceListType.Project, 80)]
    public async Task Customer_is_charged_their_assigned_price_list_not_a_discount_off_selling_price(PriceListType listType, decimal listPrice)
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        if (listType == PriceListType.Contractor) product.ContractorPrice = listPrice;
        if (listType == PriceListType.Wholesale) product.WholesalePrice = listPrice;
        if (listType == PriceListType.Project) product.ProjectPrice = listPrice;
        db.SaveChanges();
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B);
        customer.PriceListType = listType;
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, $"cashier-list-{listType}@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, qty: 1m, payAmount: listPrice));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Contractor_price_list_suppresses_the_automatic_trade_tier_discount_to_avoid_double_dipping()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        product.ContractorPrice = 70m;
        db.SaveChanges();
        // An active Trade Tier rule would normally take another 20% off — must NOT stack on top of
        // the already-negotiated Contractor list price.
        db.PricingRules.Add(new PricingRule
        {
            Name = "VIP Contractor Rate", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any",
            Action = "-20% list", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m,
        });
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Contractor);
        customer.PriceListType = PriceListType.Contractor;
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-no-double-dip@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 70 (Contractor list price), NOT 70 * 0.8 = 56 (which would double-dip the Trade Tier %).
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, qty: 1m, payAmount: 70m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Price_list_customer_falls_back_to_selling_price_when_the_product_has_no_override_configured()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        // No ContractorPrice configured on this product at all.
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B);
        customer.PriceListType = PriceListType.Contractor;
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-fallback@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, qty: 1m, payAmount: 100m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Promotional_rule_auto_applies_within_its_date_window_without_a_coupon_code()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        db.PricingRules.Add(new PricingRule
        {
            Name = "Ramadan Cement Promo", Type = "Promotional", Scope = $"SKU: {product.Sku}", Condition = "Active immediately",
            Action = "-15%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 15m, Sku = product.Sku,
            ValidFrom = DateTime.UtcNow.AddDays(-1), ValidUntil = DateTime.UtcNow.AddDays(7),
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-promo@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 100 x (1 - 15%) = 85 — no coupon code sent at all.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 85m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Promotional_rule_with_a_future_start_date_does_not_apply_yet()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        db.PricingRules.Add(new PricingRule
        {
            Name = "Next Month's Promo", Type = "Promotional", Scope = $"SKU: {product.Sku}", Condition = "Starts next month",
            Action = "-15%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 15m, Sku = product.Sku,
            ValidFrom = DateTime.UtcNow.AddDays(30),
        });
        db.SaveChanges();
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-future-promo@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Full price — the promo hasn't started yet.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 100m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Cashier_with_price_override_permission_can_override_a_lines_price_directly()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var seniorRole = TestDataSeeder.AddRole(db, "Senior Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        seniorRole.CanOverrideItemPrice = true;
        db.SaveChanges();
        var senior = TestDataSeeder.AddUser(db, seniorRole, "senior-override@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(senior);

        var line = new { productId = product.Id, qty = 1m, manualUnitPrice = 42m };
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 42m, extraLine: line));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task Cashier_without_price_override_permission_is_blocked_without_approval()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.CanOverrideItemPrice = false;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-blocked-override@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var line = new { productId = product.Id, qty = 1m, manualUnitPrice = 42m };
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 42m, extraLine: line));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("requires supervisor approval", body);
    }

    [Fact]
    public async Task Cashier_with_an_approved_price_override_request_can_complete_the_sale()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.CanOverrideItemPrice = false;
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.CanOverrideItemPrice = true;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-override-approved@test.local", branchId: branch.Id);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor-override-approved@test.local", branchId: branch.Id);

        var cashierClient = _factory.CreateAuthenticatedClient(cashier);
        var createApproval = await cashierClient.PostAsJsonAsync("/api/pos/approvals", new
        {
            type = "PriceOverride", branchId = branch.Id, amount = 42m, reason = "One-off negotiated price", relatedOrderId = (int?)null,
        });
        Assert.Equal(HttpStatusCode.OK, createApproval.StatusCode);
        var approval = await createApproval.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = approval.GetProperty("id").GetInt32();

        var supervisorClient = _factory.CreateAuthenticatedClient(supervisor);
        var approveResponse = await supervisorClient.PutAsync($"/api/pos/approvals/{approvalId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);

        var line = new { productId = product.Id, qty = 1m, manualUnitPrice = 42m };
        var checkout = await cashierClient.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, null, product.Id, qty: 1m, payAmount: 42m, extraLine: line, priceOverrideApprovalId: approvalId));

        var checkoutBody = await checkout.Content.ReadAsStringAsync();
        Assert.True(checkout.StatusCode == HttpStatusCode.OK, $"Expected OK, got {checkout.StatusCode}: {checkoutBody}");
    }
}
