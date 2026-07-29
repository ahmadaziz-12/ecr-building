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
/// BRD §2.3 cut-to-size enhancement: a minimum billable quantity (so a tiny cut still covers
/// handling/setup cost) and remnant tracking (the cashier optionally records the source piece/roll
/// size, and either restocks or scraps whatever's left over).
/// </summary>
public class Module5CutToSizeRemnantTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch Branch, Product Product, HttpClient Client) SeedContext(
        AppDbContext db, string cutToSizeUnit = "Area", decimal? minCutQty = null, decimal onHand = 100m, decimal sellingPrice = 180m)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "GLS", nameEn: "Glass");
        var product = TestDataSeeder.AddProduct(db, category, sku: "GLASS-REMNANT", nameEn: "Clear Glass 6mm",
            sellingPrice: sellingPrice, vatRate: 0m, stockUom: cutToSizeUnit == "Length" ? "m" : "m²",
            isCutToSize: true, cutToSizeUnit: cutToSizeUnit, minCutQty: minCutQty);
        TestDataSeeder.AddBranchStock(db, product, branch, onHand);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        role.CanVoidTransactions = true;
        db.SaveChanges();
        var user = TestDataSeeder.AddUser(db, role, "remnant-cashier@test.local", branchId: branch.Id);
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
    public async Task A_cut_below_the_minimum_is_billed_at_the_minimum_but_only_the_measured_amount_leaves_stock()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, minCutQty: 0.5m);

        // 0.4m x 0.5m = 0.2 m² measured, but MinCutQty=0.5 floors the bill to 0.5 m² x 180 = 90 SAR.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 0.4m, widthM = 0.5m }], payAmount: 90m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(0.5m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(0.2m, line.GetProperty("measuredQty").GetDecimal());
        Assert.Equal(90m, line.GetProperty("lineTotal").GetDecimal());
        // Only the physically-cut 0.2 m² leaves stock — the minimum charge doesn't consume more material.
        Assert.Equal(0.2m, line.GetProperty("stockQty").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(99.8m, stock.OnHand);
    }

    [Fact]
    public async Task A_cut_at_or_above_the_minimum_is_billed_at_the_measured_amount_with_no_floor_applied()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, minCutQty: 0.5m);

        // 1m x 1m = 1 m², already above the 0.5 m² minimum.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 1m, widthM = 1m }], payAmount: 180m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(1m, line.GetProperty("qty").GetDecimal());
        Assert.True(line.GetProperty("measuredQty").ValueKind is JsonValueKind.Null);
    }

    [Fact]
    public async Task Restocking_a_remnant_nets_stock_deduction_back_to_the_measured_cut_and_logs_it()
    {
        using var db = _factory.CreateDbContext();
        // Cable at 4 SAR/m — cashier cuts 2m from a 3m roll, restocks the 1m offcut.
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, sourceQty = 3m, remnantAction = "Restock" }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(2m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(3m, line.GetProperty("sourceQty").GetDecimal());
        Assert.Equal(1m, line.GetProperty("remnantQty").GetDecimal());
        Assert.Equal("Restock", line.GetProperty("remnantAction").GetString());
        // Net effect: whole 3m source consumed, 1m remnant immediately restocked = same as cutting 2m outright.
        Assert.Equal(2m, line.GetProperty("stockQty").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(198m, stock.OnHand); // 200 - 2, not 200 - 3

        var movements = await db.StockMovements.AsNoTracking().Where(m => m.ProductId == product.Id).ToListAsync();
        Assert.Contains(movements, m => m.Type == StockMovementType.CutRemnantRestock && m.Qty == 1m);
    }

    [Fact]
    public async Task Scrapping_a_remnant_removes_the_whole_source_piece_from_stock_and_logs_a_writeoff()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, sourceQty = 3m, remnantAction = "Scrap" }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(2m, line.GetProperty("qty").GetDecimal()); // customer is still billed for 2m only
        Assert.Equal(3m, line.GetProperty("stockQty").GetDecimal()); // but the whole source leaves stock

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(197m, stock.OnHand); // 200 - 3, the scrapped remnant never comes back

        var movements = await db.StockMovements.AsNoTracking().Where(m => m.ProductId == product.Id).ToListAsync();
        Assert.Contains(movements, m => m.Type == StockMovementType.WriteOff && m.Qty == -1m);
    }

    [Fact]
    public async Task Voiding_a_scrapped_remnant_sale_restores_the_full_source_amount()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        var checkout = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, sourceQty = 3m, remnantAction = "Scrap" }], payAmount: 8m));
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
        var orderId = (await checkout.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var midStock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(197m, midStock.OnHand);

        var voidResponse = await client.PutAsJsonAsync($"/api/pos/orders/{orderId}/void", new { reason = "Remnant test void", reasonCode = "TrainingError" });
        Assert.Equal(HttpStatusCode.OK, voidResponse.StatusCode);

        var finalStock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(200m, finalStock.OnHand); // the full 3m, including the scrapped remnant, comes back
    }

    [Fact]
    public async Task A_source_size_smaller_than_the_cut_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 3m, sourceQty = 2m, remnantAction = "Restock" }], payAmount: 12m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("can't be smaller than", await response.Content.ReadAsStringAsync());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(200m, stock.OnHand);
    }

    [Fact]
    public async Task A_positive_remnant_without_a_valid_action_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, sourceQty = 3m }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Restock or Scrap", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_source_size_exactly_matching_the_cut_needs_no_remnant_action()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);

        // sourceQty == the measured cut — zero remnant, so no RemnantAction is required at all.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, sourceQty = 2m }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.True(line.GetProperty("remnantQty").ValueKind is JsonValueKind.Null);
    }
}
