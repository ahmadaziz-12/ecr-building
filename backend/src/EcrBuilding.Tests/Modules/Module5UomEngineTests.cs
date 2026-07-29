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

/// <summary>
/// Module 5 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — the BRD §2.3 CRITICAL UOM conversion engine:
/// configurable selling-UOM factors, stock deduction always in stock UOM, and cut-to-size
/// length × width dimension pricing.
/// </summary>
public class Module5UomMathTests
{
    [Fact]
    public void Selling_in_the_stock_uom_itself_is_always_factor_1()
    {
        Assert.Equal(1m, UomMath.FactorToStock("Bag", "Bag", []));
        Assert.Equal(1m, UomMath.FactorToStock("bag", "Bag", [])); // case-insensitive
    }

    [Fact]
    public void Configured_conversion_resolves_in_both_directions_of_magnitude()
    {
        (string, decimal)[] conversions = [("Pallet", 50m), ("Kg", 0.02m)];
        // 1 Pallet = 50 Bags — and the sub-unit direction, 1 Kg = 0.02 Bag (a 50kg bag).
        Assert.Equal(50m, UomMath.FactorToStock("Pallet", "Bag", conversions));
        Assert.Equal(0.02m, UomMath.FactorToStock("kg", "Bag", conversions));
        Assert.Equal(100m, UomMath.ToStockQty(2m, 50m));
        Assert.Equal(1m, UomMath.ToStockQty(50m, 0.02m));
    }

    [Fact]
    public void Unconfigured_uom_returns_null_never_a_silent_1_to_1()
    {
        Assert.Null(UomMath.FactorToStock("Truckload", "Bag", [("Pallet", 50m)]));
        Assert.Null(UomMath.FactorToStock("Pallet", "Bag", []));
        // A zero/negative factor row is treated as unconfigured, not as a valid conversion.
        Assert.Null(UomMath.FactorToStock("Pallet", "Bag", [("Pallet", 0m)]));
    }

    [Fact]
    public void Cut_to_size_area_is_length_times_width_including_non_square_shapes()
    {
        Assert.Equal(3.000m, UomMath.AreaOf(2.5m, 1.2m));
        Assert.Equal(2.000m, UomMath.AreaOf(0.5m, 4m)); // non-square: same area, different shape
        Assert.Equal(0.563m, UomMath.AreaOf(0.75m, 0.75m)); // rounds to 3dp (0.5625 → 0.563)
    }

    [Fact]
    public void Cut_to_size_length_is_the_entered_length_rounded_to_3dp()
    {
        Assert.Equal(4.5m, UomMath.LengthOf(4.5m));
        Assert.Equal(0.563m, UomMath.LengthOf(0.5625m));
    }

    [Fact]
    public void Cut_to_size_volume_is_length_times_width_times_height()
    {
        Assert.Equal(6.000m, UomMath.VolumeOf(2m, 1.5m, 2m));
        Assert.Equal(0.563m, UomMath.VolumeOf(0.75m, 0.75m, 1m)); // rounds to 3dp
    }
}

public class Module5UomEngineTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch Branch, Product Product, HttpClient Client) SeedCheckoutContext(
        AppDbContext db, decimal sellingPrice = 20m, decimal onHand = 500m, bool isCutToSize = false)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: sellingPrice, vatRate: 0m, isCutToSize: isCutToSize);
        TestDataSeeder.AddBranchStock(db, product, branch, onHand);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        role.CanVoidTransactions = true; // the void test exercises Module 17's authorization gate
        db.SaveChanges();
        var user = TestDataSeeder.AddUser(db, role, "uom-cashier@test.local", branchId: branch.Id);
        return (branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object CheckoutRequest(int branchId, object[] lines, decimal payAmount) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId = (int?)null,
        type = "Retail",
        lines,
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null,
        manualDiscount = (object?)null,
        customFees = (object?)null,
        notes = (string?)null,
    };

    [Fact]
    public async Task Selling_one_pallet_deducts_fifty_bags_from_stock_not_one()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedCheckoutContext(db, sellingPrice: 20m, onHand: 500m);
        TestDataSeeder.AddUomConversion(db, product, "Pallet", 50m);

        // 2 Pallet × (50 bags × 20 SAR) = 2,000 SAR
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 2m, uom = "Pallet" }], payAmount: 2000m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal("Pallet", line.GetProperty("uom").GetString());
        Assert.Equal(2m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(100m, line.GetProperty("stockQty").GetDecimal());
        Assert.Equal(1000m, line.GetProperty("unitPrice").GetDecimal()); // price per pallet

        var stock = await db.BranchStockLevels.AsNoTracking()
            .FirstAsync(s => s.ProductId == product.Id && s.BranchId == branch.Id);
        Assert.Equal(400m, stock.OnHand); // 500 - (2 pallets × 50 bags)
    }

    [Fact]
    public async Task Selling_an_unconfigured_uom_fails_loudly_instead_of_assuming_1_to_1()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedCheckoutContext(db);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 1m, uom = "Pallet" }], payAmount: 20m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("No conversion factor is configured", body);

        // And crucially: nothing was deducted.
        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(500m, stock.OnHand);
    }

    [Fact]
    public async Task Selling_without_a_uom_behaves_exactly_as_before_the_engine_existed()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedCheckoutContext(db, sellingPrice: 20m);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 3m }], payAmount: 60m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal("Bag", line.GetProperty("uom").GetString()); // stock UOM recorded explicitly
        Assert.Equal(3m, line.GetProperty("stockQty").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(497m, stock.OnHand);
    }

    [Fact]
    public async Task Cut_to_size_dimensions_compute_area_and_price_per_m2()
    {
        using var db = _factory.CreateDbContext();
        // Glass at 180 SAR/m², stocked in m².
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "GLS", nameEn: "Glass");
        var product = TestDataSeeder.AddProduct(db, category, sku: "GLASS-6MM", nameEn: "Clear Glass 6mm",
            sellingPrice: 180m, vatRate: 0m, stockUom: "m²", isCutToSize: true);
        TestDataSeeder.AddBranchStock(db, product, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "glass-cashier@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // 2.5m × 1.2m = 3.0 m² × 180 SAR = 540 SAR
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2.5m, widthM = 1.2m }], payAmount: 540m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(3m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(3m, line.GetProperty("stockQty").GetDecimal());
        Assert.Equal(180m, line.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(540m, line.GetProperty("lineTotal").GetDecimal());
        Assert.Equal(2.5m, line.GetProperty("lengthM").GetDecimal());
        Assert.Equal(1.2m, line.GetProperty("widthM").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(97m, stock.OnHand);
    }

    [Fact]
    public async Task Cut_to_size_length_mode_bills_the_entered_length_with_no_width_needed()
    {
        using var db = _factory.CreateDbContext();
        // Cable at 4 SAR/m, stocked in m (linear length only — no width, unlike glass's area mode).
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "ELC", nameEn: "Electrical");
        var product = TestDataSeeder.AddProduct(db, category, sku: "CABLE-CUT", nameEn: "Cut Cable",
            sellingPrice: 4m, vatRate: 0m, stockUom: "m", isCutToSize: true, cutToSizeUnit: "Length");
        TestDataSeeder.AddBranchStock(db, product, branch, 200m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "cable-cashier@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // 12.5m × 4 SAR = 50 SAR — no widthM sent at all.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 12.5m }], payAmount: 50m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(12.5m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(50m, line.GetProperty("lineTotal").GetDecimal());
        Assert.Equal(12.5m, line.GetProperty("lengthM").GetDecimal());
        Assert.True(line.GetProperty("widthM").ValueKind is JsonValueKind.Null);

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(187.5m, stock.OnHand);
    }

    [Fact]
    public async Task Cut_to_size_volume_mode_bills_length_times_width_times_height()
    {
        using var db = _factory.CreateDbContext();
        // Sand at 50 SAR/m³, stocked in m³.
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "SND", nameEn: "Aggregates");
        var product = TestDataSeeder.AddProduct(db, category, sku: "SAND-CUT", nameEn: "Bulk Sand",
            sellingPrice: 50m, vatRate: 0m, stockUom: "m³", isCutToSize: true, cutToSizeUnit: "Volume");
        TestDataSeeder.AddBranchStock(db, product, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "sand-cashier@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // 2m × 1.5m × 2m = 6 m³ × 50 SAR = 300 SAR
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, widthM = 1.5m, heightM = 2m }], payAmount: 300m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(6m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(300m, line.GetProperty("lineTotal").GetDecimal());
        Assert.Equal(2m, line.GetProperty("heightM").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(94m, stock.OnHand);
    }

    [Fact]
    public async Task Cut_to_size_volume_mode_rejects_a_missing_height()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "SND2", nameEn: "Aggregates 2");
        var product = TestDataSeeder.AddProduct(db, category, sku: "SAND-CUT-2", nameEn: "Bulk Sand 2",
            sellingPrice: 50m, vatRate: 0m, stockUom: "m³", isCutToSize: true, cutToSizeUnit: "Volume");
        TestDataSeeder.AddBranchStock(db, product, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "sand-cashier-2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, widthM = 1.5m }], payAmount: 0m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("must be positive", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Cut_to_size_rejects_non_positive_dimensions()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedCheckoutContext(db, isCutToSize: true);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = -2m, widthM = 1m }], payAmount: 0m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("must be positive", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Voiding_a_pallet_sale_restores_the_converted_stock_quantity()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedCheckoutContext(db, sellingPrice: 20m, onHand: 500m);
        TestDataSeeder.AddUomConversion(db, product, "Pallet", 50m);

        var checkout = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 1m, uom = "Pallet" }], payAmount: 1000m));
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
        var orderId = (await checkout.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var midStock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(450m, midStock.OnHand);

        var voidResponse = await client.PutAsJsonAsync($"/api/pos/orders/{orderId}/void", new { reason = "UOM test void", reasonCode = "TrainingError" });
        Assert.Equal(HttpStatusCode.OK, voidResponse.StatusCode);

        var finalStock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(500m, finalStock.OnHand); // 50 bags restored, not 1
    }

    [Fact]
    public async Task Admin_can_configure_conversions_and_they_round_trip_through_the_product_api()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: ModuleArea.Inventory);
        var user = TestDataSeeder.AddUser(db, role, "inv-admin@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/catalog/products", new
        {
            sku = "CEM-UOM-1", barcode = (string?)null, nameEn = "Cement UOM Test", nameAr = (string?)null,
            categoryId = category.Id, brand = (string?)null, costPrice = 15m, sellingPrice = 22.5m, vatRate = 15m,
            stockUom = "Bag", sellUoms = new[] { "Pallet", "Ton" }, weight = 50m, returnable = true,
            reorderLevel = 10, reorderQty = 100, imageUrl = (string?)null,
            uomConversions = new[] { new { uom = "Pallet", factorToStock = 50m }, new { uom = "Ton", factorToStock = 20m } },
            isCutToSize = false,
        });

        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var product = await create.Content.ReadFromJsonAsync<JsonElement>();
        var conversions = product.GetProperty("uomConversions").EnumerateArray()
            .ToDictionary(c => c.GetProperty("uom").GetString()!, c => c.GetProperty("factorToStock").GetDecimal());
        Assert.Equal(50m, conversions["Pallet"]);
        Assert.Equal(20m, conversions["Ton"]);
        Assert.False(product.GetProperty("isCutToSize").GetBoolean());
    }
}
