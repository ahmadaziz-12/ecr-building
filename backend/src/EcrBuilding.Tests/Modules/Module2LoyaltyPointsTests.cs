using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Module 2 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — loyalty points must be earned on the taxable
/// merchandise total only (never VAT, fees, or the loyalty-redeemed portion), at a rate configurable
/// per product category (BRD §4.3.1). Settings-configurable via LoyaltyConfigLoader; BRD default is
/// 1 point per SAR 1 earned, 100 points redeem for SAR 1.
/// </summary>
public class Module2LoyaltyPointsTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Category category, User cashier) SeedBase(AppDbContext db, decimal accrualMultiplier = 1m)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        category.LoyaltyAccrualMultiplier = accrualMultiplier;
        TestDataSeeder.AddStandardGlAccounts(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        db.SaveChanges();
        return (branch, category, cashier);
    }

    private static object CheckoutRequest(int branchId, int? customerId, int productId, object[] payments, object[]? customFees = null) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId,
        type = "Retail",
        lines = new[] { new { productId, qty = 1m } },
        payments,
        couponCode = (string?)null,
        manualDiscount = (object?)null,
        customFees,
        notes = (string?)null,
    };

    [Fact]
    public async Task Points_are_earned_on_the_pre_VAT_amount_not_the_VAT_inclusive_total()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db);
        // Price 100, VAT 15% -> GrandTotal 115. Points must be based on 100 (=100 points), not 115 (=115).
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 15m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders",
            CheckoutRequest(branch.Id, customer.Id, product.Id, [new { method = "Cash", amount = 115m }]));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(100, updated.LoyaltyPoints);
    }

    [Fact]
    public async Task Points_are_earned_on_merchandise_only_not_custom_fees()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db);
        // Price 100, VAT 0, + a 20 SAR custom fee -> GrandTotal 120. Points must be based on 100
        // (=100 points), not 120 (=120).
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(
            branch.Id, customer.Id, product.Id, [new { method = "Cash", amount = 120m }],
            customFees: [new { label = "Delivery", amount = 20m }]));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(100, updated.LoyaltyPoints);
    }

    [Fact]
    public async Task Category_accrual_multiplier_doubles_points_earned()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db, accrualMultiplier: 2m);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders",
            CheckoutRequest(branch.Id, customer.Id, product.Id, [new { method = "Cash", amount = 100m }]));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(200, updated.LoyaltyPoints); // 100 SAR * 2x multiplier * 1 pt/SAR = 200
    }

    [Fact]
    public async Task Standard_category_default_multiplier_is_1x_when_unconfigured()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db); // default multiplier, never explicitly set to 1
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, [new { method = "Cash", amount = 100m }]));

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(100, updated.LoyaltyPoints);
    }

    [Fact]
    public async Task Points_earned_exclude_the_portion_paid_with_redeemed_loyalty_points()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db);
        // 1000 SAR order so a 50 SAR redemption is 5% of the total, inside the BRD default 20% cap
        // (a 50/50 split on a 100 SAR order would itself be over that cap and get rejected).
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 1000m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        customer.LoyaltyPoints = 6000; // enough to redeem 50 SAR at BRD default 100 pts/SAR = 5000 points
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        // 50 SAR via redeemed points + 950 SAR cash = 1000 SAR total. Eligible base for earning is
        // 1000 - 50 (redeemed) = 950 SAR -> floor(950 * 1 pt/SAR) = 950 points earned.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(
            branch.Id, customer.Id, product.Id,
            [new { method = "Loyalty", amount = 50m }, new { method = "Cash", amount = 950m }]));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(6000 - 5000 + 950, updated.LoyaltyPoints);
    }

    [Fact]
    public async Task Checkout_response_carries_points_earned_balance_and_next_tier_threshold_for_the_receipt()
    {
        using var db = _factory.CreateDbContext();
        var (branch, category, cashier) = SeedBase(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        customer.LoyaltyEnrolled = true;
        customer.LoyaltyPoints = 495;
        customer.LoyaltyLifetimeSpend = 4_950m; // 50 SAR short of the Silver band (Module 7: tiers = SAR spend)
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Earns exactly 100 points (100 SAR * 1 pt/SAR); spend reaches 5,050 → Silver, so the
        // receipt's next-tier threshold is Gold's SAR 20,000 band (BRD §4.3.2 spend bands, not points).
        var response = await client.PostAsJsonAsync("/api/pos/orders",
            CheckoutRequest(branch.Id, customer.Id, product.Id, [new { method = "Cash", amount = 100m }]));

        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(100, order.GetProperty("loyaltyPointsEarned").GetInt32());
        Assert.Equal(595, order.GetProperty("loyaltyPointsBalance").GetInt32());
        Assert.Equal(20_000, order.GetProperty("loyaltyNextTierThreshold").GetInt32());
    }
}
