using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>Module 7 unit tests — BRD §4.3.2 SAR-spend tier bands, multipliers, and benefits.</summary>
public class Module7LoyaltyRulesTests
{
    [Theory]
    [InlineData(0, LoyaltyTier.Bronze)]
    [InlineData(4_999, LoyaltyTier.Bronze)]
    [InlineData(5_000, LoyaltyTier.Silver)]
    [InlineData(19_999, LoyaltyTier.Silver)]
    [InlineData(20_000, LoyaltyTier.Gold)]
    [InlineData(49_999, LoyaltyTier.Gold)]
    [InlineData(50_000, LoyaltyTier.Platinum)]
    public void Tier_bands_match_the_BRD_exactly_at_every_boundary(decimal spend, LoyaltyTier expected) =>
        Assert.Equal(expected, LoyaltyRules.TierForLifetimeSpend(spend, LoyaltyConfig.Default));

    [Fact]
    public void Tier_multipliers_and_discounts_follow_the_BRD_ladder()
    {
        var config = LoyaltyConfig.Default;
        Assert.Equal(1m, LoyaltyRules.TierPointsMultiplier(LoyaltyTier.Bronze, config));
        Assert.Equal(1.5m, LoyaltyRules.TierPointsMultiplier(LoyaltyTier.Silver, config));
        Assert.Equal(2m, LoyaltyRules.TierPointsMultiplier(LoyaltyTier.Gold, config));
        Assert.Equal(3m, LoyaltyRules.TierPointsMultiplier(LoyaltyTier.Platinum, config));

        Assert.Equal(0m, LoyaltyRules.TierDiscountPct(LoyaltyTier.Bronze, config));
        Assert.Equal(5m, LoyaltyRules.TierDiscountPct(LoyaltyTier.Silver, config));
        Assert.Equal(10m, LoyaltyRules.TierDiscountPct(LoyaltyTier.Gold, config));
        Assert.Equal(15m, LoyaltyRules.TierDiscountPct(LoyaltyTier.Platinum, config));
    }

    [Fact]
    public void Free_delivery_needs_silver_or_above_AND_an_order_over_500()
    {
        var config = LoyaltyConfig.Default;
        Assert.True(LoyaltyRules.QualifiesForFreeDelivery(LoyaltyTier.Silver, 501m, config));
        Assert.False(LoyaltyRules.QualifiesForFreeDelivery(LoyaltyTier.Silver, 500m, config));
        Assert.False(LoyaltyRules.QualifiesForFreeDelivery(LoyaltyTier.Bronze, 10_000m, config));
        Assert.True(LoyaltyRules.QualifiesForFreeDelivery(LoyaltyTier.Platinum, 501m, config));
    }
}

/// <summary>Module 7 integration tests — tier benefits actually applied at checkout.</summary>
public class Module7LoyaltyTierTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (AppDbContext Db, Branch Branch, Product Product, HttpClient Client) SeedCheckout()
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "tier-cashier@test.local", branchId: branch.Id);
        return (db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static Customer AddLoyaltyCustomer(AppDbContext db, decimal lifetimeSpend)
    {
        var customer = TestDataSeeder.AddCustomer(db, nameEn: $"Tier Customer {lifetimeSpend}", type: CustomerType.Retail);
        customer.LoyaltyEnrolled = true;
        customer.LoyaltyLifetimeSpend = lifetimeSpend;
        customer.LoyaltyTier = LoyaltyRules.TierForLifetimeSpend(lifetimeSpend, LoyaltyConfig.Default);
        db.SaveChanges();
        return customer;
    }

    private static object Checkout(int branchId, int? customerId, int productId, decimal qty, decimal payAmount, object[]? fees = null) => new
    {
        branchId, terminalId = (int?)null, customerId, type = "Retail",
        lines = new[] { new { productId, qty } },
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null, manualDiscount = (object?)null,
        customFees = fees, notes = (string?)null,
    };

    [Fact]
    public async Task Gold_customer_automatically_gets_10_percent_off_with_no_cashier_action()
    {
        var (db, branch, product, client) = SeedCheckout();
        using var _ = db;
        var gold = AddLoyaltyCustomer(db, 25_000m);

        // 10 × 100 − 10% = 900.
        var response = await client.PostAsJsonAsync("/api/pos/orders", Checkout(branch.Id, gold.Id, product.Id, 10m, 900m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(900m, order.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(10m, order.GetProperty("lines")[0].GetProperty("discountPct").GetDecimal());
    }

    [Fact]
    public async Task Silver_customer_delivery_fee_is_waived_over_500_but_charged_at_or_under()
    {
        var (db, branch, product, client) = SeedCheckout();
        using var _ = db;
        var silver = AddLoyaltyCustomer(db, 6_000m);

        // 10 × 100 − 5% = 950 merchandise > 500 → the 40 SAR delivery fee is waived.
        var bigOrder = await client.PostAsJsonAsync("/api/pos/orders",
            Checkout(branch.Id, silver.Id, product.Id, 10m, 950m, fees: [new { label = "Delivery", amount = 40m }]));
        Assert.Equal(HttpStatusCode.OK, bigOrder.StatusCode);
        var big = await bigOrder.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(950m, big.GetProperty("grandTotal").GetDecimal());
        Assert.Contains("waived", big.GetProperty("fees")[0].GetProperty("label").GetString());

        // 2 × 100 − 5% = 190 ≤ 500 → fee still charged (190 + 40 = 230).
        var smallOrder = await client.PostAsJsonAsync("/api/pos/orders",
            Checkout(branch.Id, silver.Id, product.Id, 2m, 230m, fees: [new { label = "Delivery", amount = 40m }]));
        Assert.Equal(HttpStatusCode.OK, smallOrder.StatusCode);
    }

    [Fact]
    public async Task Points_accrue_at_the_tier_multiplier_and_spend_promotes_the_tier_for_next_time()
    {
        var (db, branch, product, client) = SeedCheckout();
        using var _ = db;
        var silver = AddLoyaltyCustomer(db, 6_000m); // Silver → 1.5x, 5% discount

        // 10 × 100 − 5% = 950 eligible SAR × 1.5 = 1425 → 1425 points (BRD default 1 pt/SAR).
        var response = await client.PostAsJsonAsync("/api/pos/orders", Checkout(branch.Id, silver.Id, product.Id, 10m, 950m));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1425, order.GetProperty("loyaltyPointsEarned").GetInt32());

        var updated = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == silver.Id);
        Assert.Equal(6_950m, updated.LoyaltyLifetimeSpend);
        Assert.Equal(LoyaltyTier.Silver, updated.LoyaltyTier);
        // Receipt shows the SAR spend threshold of the next tier (Gold at 20,000).
        Assert.Equal(20_000, order.GetProperty("loyaltyNextTierThreshold").GetInt32());
    }
}
