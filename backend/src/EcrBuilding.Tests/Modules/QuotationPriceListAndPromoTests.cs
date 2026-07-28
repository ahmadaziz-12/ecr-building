using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// BRD §7 gap closed: QuotationsController.BuildLines used to always price at Product.SellingPrice,
/// ignoring the customer's assigned PriceListType and never checking Promotional rules or a manual
/// per-line price override — so a Contractor/Wholesale/Project customer's formal quotation silently
/// reverted to Retail pricing even though the same customer's till checkout (OrdersController) would
/// charge them correctly. Mirrors PriceListsAndPromoPricingTests but against /api/pos/quotations.
/// All test products use SellingPrice=100, VatRate=0 so totals reduce to plain arithmetic.
/// </summary>
public class QuotationPriceListAndPromoTests : IAsyncLifetime
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
        var user = TestDataSeeder.AddUser(db, role, $"quote-plist-{Guid.NewGuid():N}@test.local", branchId: branch.Id);
        return new Context(db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object CreateRequest(int branchId, int? customerId, int productId, decimal qty, object? extraLine = null, int? priceOverrideApprovalId = null) => new
    {
        branchId, customerId, lines = new[] { extraLine ?? new { productId, qty } },
        projectCode = "PRJ-1", customerReference = "REF-1",
        priceOverrideApprovalRequestId = priceOverrideApprovalId,
    };

    [Theory]
    [InlineData(PriceListType.Contractor, 70)]
    [InlineData(PriceListType.Wholesale, 60)]
    [InlineData(PriceListType.Project, 80)]
    public async Task Quotation_prices_at_the_customers_assigned_price_list_not_selling_price(PriceListType listType, decimal listPrice)
    {
        var ctx = SeedContext();
        if (listType == PriceListType.Contractor) ctx.Product.ContractorPrice = listPrice;
        if (listType == PriceListType.Wholesale) ctx.Product.WholesalePrice = listPrice;
        if (listType == PriceListType.Project) ctx.Product.ProjectPrice = listPrice;
        ctx.Db.SaveChanges();
        var customer = TestDataSeeder.AddCustomer(ctx.Db, type: CustomerType.B2B);
        customer.PriceListType = listType;
        ctx.Db.SaveChanges();

        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, customer.Id, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(listPrice, body.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(listPrice, body.GetProperty("lines")[0].GetProperty("unitPrice").GetDecimal());
    }

    [Fact]
    public async Task Quotation_falls_back_to_selling_price_when_customer_has_no_list_override_configured()
    {
        var ctx = SeedContext();
        var customer = TestDataSeeder.AddCustomer(ctx.Db, type: CustomerType.B2B);
        customer.PriceListType = PriceListType.Contractor; // no ContractorPrice set on the product
        ctx.Db.SaveChanges();

        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, customer.Id, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(100m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Contractor_price_list_suppresses_the_automatic_trade_tier_discount_on_a_quotation()
    {
        var ctx = SeedContext();
        ctx.Product.ContractorPrice = 70m;
        ctx.Db.SaveChanges();
        // An active Trade Tier rule would normally take another 20% off — must NOT stack on top of
        // the already-negotiated Contractor list price (same rule OrdersController.Checkout enforces).
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "VIP Contractor Rate", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any",
            Action = "-20% list", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 20m,
        });
        var customer = TestDataSeeder.AddCustomer(ctx.Db, type: CustomerType.Contractor);
        customer.PriceListType = PriceListType.Contractor;
        ctx.Db.SaveChanges();

        // 70 (Contractor list price), NOT 70 * 0.8 = 56.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, customer.Id, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(70m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task An_explicit_manual_discount_still_applies_on_top_of_a_list_price_quotation()
    {
        var ctx = SeedContext();
        ctx.Product.ContractorPrice = 70m;
        ctx.Db.SaveChanges();
        var customer = TestDataSeeder.AddCustomer(ctx.Db, type: CustomerType.B2B);
        customer.PriceListType = PriceListType.Contractor;
        ctx.Db.SaveChanges();

        // 70 x (1 - 10%) = 63 — an explicit DiscountPct typed on the form is a deliberate human
        // choice, unlike the automatic contractor fallback, so it is never suppressed.
        var request = new
        {
            branchId = ctx.Branch.Id, customerId = customer.Id, lines = new[] { new { productId = ctx.Product.Id, qty = 1m } },
            projectCode = "PRJ-1", customerReference = "REF-1", discountPct = 10m,
        };
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", request);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(63m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Promotional_rule_auto_applies_to_a_quotation_within_its_date_window()
    {
        var ctx = SeedContext();
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "Ramadan Cement Promo", Type = "Promotional", Scope = $"SKU: {ctx.Product.Sku}", Condition = "Active immediately",
            Action = "-15%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 15m, Sku = ctx.Product.Sku,
            ValidFrom = DateTime.UtcNow.AddDays(-1), ValidUntil = DateTime.UtcNow.AddDays(7),
        });
        ctx.Db.SaveChanges();

        // 100 x (1 - 15%) = 85 — no coupon or discount typed at all.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(85m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Promotional_rule_with_a_future_start_date_does_not_apply_to_a_quotation_yet()
    {
        var ctx = SeedContext();
        ctx.Db.PricingRules.Add(new PricingRule
        {
            Name = "Next Month's Promo", Type = "Promotional", Scope = $"SKU: {ctx.Product.Sku}", Condition = "Starts next month",
            Action = "-15%", Priority = 10, Status = PricingRuleStatus.Active,
            DiscountType = RuleDiscountType.Percentage, Value = 15m, Sku = ctx.Product.Sku,
            ValidFrom = DateTime.UtcNow.AddDays(30),
        });
        ctx.Db.SaveChanges();

        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 1m));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(100m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Cashier_without_price_override_permission_is_blocked_from_overriding_a_quotation_lines_price()
    {
        var ctx = SeedContext();
        var line = new { productId = ctx.Product.Id, qty = 1m, manualUnitPrice = 42m };

        var response = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, null, ctx.Product.Id, qty: 1m, extraLine: line));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("requires supervisor approval", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Senior_role_with_price_override_permission_can_override_a_quotation_lines_price_directly()
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        var seniorRole = TestDataSeeder.AddRole(db, "Senior Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        seniorRole.CanOverrideItemPrice = true;
        db.SaveChanges();
        var senior = TestDataSeeder.AddUser(db, seniorRole, "senior-quote-override@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(senior);

        var line = new { productId = product.Id, qty = 1m, manualUnitPrice = 42m };
        var response = await client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(branch.Id, null, product.Id, qty: 1m, extraLine: line));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(42m, body.GetProperty("grandTotal").GetDecimal());
    }

    [Fact]
    public async Task Cashier_with_an_approved_price_override_request_can_quote_the_overridden_price()
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.CanOverrideItemPrice = false;
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.CanOverrideItemPrice = true;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier-quote-override-approved@test.local", branchId: branch.Id);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor-quote-override-approved@test.local", branchId: branch.Id);

        var cashierClient = _factory.CreateAuthenticatedClient(cashier);
        var createApproval = await cashierClient.PostAsJsonAsync("/api/pos/approvals", new
        {
            type = "PriceOverride", branchId = branch.Id, amount = 42m, reason = "One-off negotiated quote price", relatedOrderId = (int?)null,
        });
        Assert.Equal(HttpStatusCode.OK, createApproval.StatusCode);
        var approval = await createApproval.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = approval.GetProperty("id").GetInt32();

        var supervisorClient = _factory.CreateAuthenticatedClient(supervisor);
        Assert.Equal(HttpStatusCode.OK, (await supervisorClient.PutAsync($"/api/pos/approvals/{approvalId}/approve", null)).StatusCode);

        var line = new { productId = product.Id, qty = 1m, manualUnitPrice = 42m };
        var response = await cashierClient.PostAsJsonAsync("/api/pos/quotations",
            CreateRequest(branch.Id, null, product.Id, qty: 1m, extraLine: line, priceOverrideApprovalId: approvalId));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body.ToString());
        Assert.Equal(42m, body.GetProperty("grandTotal").GetDecimal());
    }
}
