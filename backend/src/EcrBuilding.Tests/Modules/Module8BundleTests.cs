using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Module 8 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — bundles sellable through checkout (BRD §5):
/// constituent expansion at proportional bundle prices, per-item VAT (never blended), stock
/// enforcement per constituent, and the Bundle Sales Report.
/// </summary>
public class Module8BundleTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private sealed record Ctx(AppDbContext Db, Branch Branch, Product Cement, Product Sealant, ProductBundle Bundle, HttpClient Client);

    /// <summary>
    /// "Waterproof Kit": 10 × cement (100 SAR, 15% VAT) + 2 × sealant (50 SAR, 0% VAT) = 1,100
    /// individually, sold as a bundle for 990 (10% off). Different VAT rates on purpose — proves
    /// per-item VAT survives bundling.
    /// </summary>
    private Ctx SeedBundleContext(decimal cementStock = 500m, decimal sealantStock = 500m)
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var cement = TestDataSeeder.AddProduct(db, category, sku: "CEM-B", nameEn: "Cement", sellingPrice: 100m, vatRate: 15m);
        var sealant = TestDataSeeder.AddProduct(db, category, sku: "SEAL-B", nameEn: "Sealant", sellingPrice: 50m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, cement, branch, cementStock);
        TestDataSeeder.AddBranchStock(db, sealant, branch, sealantStock);
        TestDataSeeder.AddStandardGlAccounts(db);

        var bundle = new ProductBundle
        {
            Code = "BND-WPK", NameEn = "Waterproof Kit", Type = BundleType.ProductSystem, BundlePrice = 990m,
            // Phase 4 (BRD §5.7): a freshly-constructed bundle defaults to Draft, invisible to
            // checkout — these tests are about checkout/pricing behavior, so seed it as already
            // approved and live, same as a bundle that passed the real approval workflow.
            Status = BundleStatus.Active,
            Lines = [new BundleLine { ProductId = cement.Id, Qty = 10m }, new BundleLine { ProductId = sealant.Id, Qty = 2m }],
        };
        db.ProductBundles.Add(bundle);
        db.SaveChanges();

        // Phase 5: bundle-sales now lives under /insights/reports (Insights section), not
        // /stock/bundles (Inventory) — needs ModuleArea.Insights too for the report test below.
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Inventory, ModuleArea.Insights]);
        var user = TestDataSeeder.AddUser(db, role, "bundle-cashier@test.local", branchId: branch.Id);
        return new Ctx(db, branch, cement, sealant, bundle, _factory.CreateAuthenticatedClient(user));
    }

    private static object BundleCheckout(int branchId, int bundleId, decimal bundleQty, decimal payAmount) => new
    {
        branchId, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
        lines = Array.Empty<object>(),
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
        bundles = new[] { new { bundleId, qty = bundleQty } },
    };

    [Fact]
    public async Task Bundle_expands_into_constituent_lines_at_proportional_prices_with_per_item_VAT()
    {
        var ctx = SeedBundleContext();
        using var db = ctx.Db;

        // Price factor 990/1100 = 0.9 → cement 90/unit (15% VAT), sealant 45/unit (0% VAT).
        // Taxable 990; VAT = 900 × 15% = 135 → total 1125.
        var response = await ctx.Client.PostAsJsonAsync("/api/pos/orders", BundleCheckout(ctx.Branch.Id, ctx.Bundle.Id, 1m, 1125m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var lines = order.GetProperty("lines").EnumerateArray().ToList();
        Assert.Equal(2, lines.Count);

        var cementLine = lines.Single(l => l.GetProperty("sku").GetString() == "CEM-B");
        Assert.Equal(90m, cementLine.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(15m, cementLine.GetProperty("vatRate").GetDecimal());
        Assert.Equal(ctx.Bundle.Id, cementLine.GetProperty("bundleId").GetInt32());
        Assert.Equal("Waterproof Kit", cementLine.GetProperty("bundleName").GetString());

        var sealantLine = lines.Single(l => l.GetProperty("sku").GetString() == "SEAL-B");
        Assert.Equal(45m, sealantLine.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(0m, sealantLine.GetProperty("vatRate").GetDecimal());

        // The 110 SAR bundle saving is a visible discount, not a silent reprice.
        Assert.Equal(110m, order.GetProperty("discountTotal").GetDecimal());
        Assert.Equal(1125m, order.GetProperty("grandTotal").GetDecimal());

        // Constituent stock deducted individually.
        Assert.Equal(490m, (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Cement.Id)).OnHand);
        Assert.Equal(498m, (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Sealant.Id)).OnHand);
    }

    [Fact]
    public async Task Bundle_with_an_out_of_stock_constituent_is_rejected_and_nothing_is_charged()
    {
        var ctx = SeedBundleContext(sealantStock: 1m); // needs 2 sealant per kit
        using var db = ctx.Db;

        var response = await ctx.Client.PostAsJsonAsync("/api/pos/orders", BundleCheckout(ctx.Branch.Id, ctx.Bundle.Id, 1m, 1125m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Insufficient stock", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Bundle_sales_report_aggregates_units_revenue_and_discount_given()
    {
        var ctx = SeedBundleContext();
        using var db = ctx.Db;

        var first = await ctx.Client.PostAsJsonAsync("/api/pos/orders", BundleCheckout(ctx.Branch.Id, ctx.Bundle.Id, 1m, 1125m));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var second = await ctx.Client.PostAsJsonAsync("/api/pos/orders", BundleCheckout(ctx.Branch.Id, ctx.Bundle.Id, 2m, 2250m));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        // Phase 5: superseded api/catalog/bundles/sales-report (dead code, no frontend call site) —
        // the report now lives under api/insights/reports, alongside every other report.
        var report = await ctx.Client.GetAsync("/api/insights/reports/bundle-sales");
        Assert.Equal(HttpStatusCode.OK, report.StatusCode);
        var rows = await report.Content.ReadFromJsonAsync<JsonElement>();
        var row = rows.EnumerateArray().Single(r => r.GetProperty("code").GetString() == "BND-WPK");

        Assert.Equal(3m, row.GetProperty("unitsSold").GetDecimal());
        Assert.Equal(2970m, row.GetProperty("revenue").GetDecimal());   // 3 × 990 ex VAT
        Assert.Equal(330m, row.GetProperty("savings").GetDecimal());    // 3 × (1100 − 990)
        Assert.Equal("ProductSystem", row.GetProperty("type").GetString());
    }
}
