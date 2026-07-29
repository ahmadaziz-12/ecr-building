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
    public async Task Restocking_a_remnant_removes_the_whole_source_from_stock_and_tracks_the_leftover_as_its_own_remnant()
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
        // Cut Optimization/Remnants Management: the whole 3m source leaves stock — the 1m leftover is
        // no longer silently folded back into OnHand, it becomes its own tracked, sellable Remnant.
        Assert.Equal(3m, line.GetProperty("stockQty").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(197m, stock.OnHand); // 200 - 3, not 200 - 2

        var movements = await db.StockMovements.AsNoTracking().Where(m => m.ProductId == product.Id).ToListAsync();
        Assert.Contains(movements, m => m.Type == StockMovementType.CutRemnantRestock && m.Qty == 1m);

        var remnant = await db.Remnants.AsNoTracking().SingleAsync(r => r.ProductId == product.Id);
        Assert.Equal(1m, remnant.Qty);
        Assert.Equal(1m, remnant.LengthM);
        Assert.Equal(RemnantStatus.Available, remnant.Status);
        Assert.Equal(branch.Id, remnant.BranchId);
    }

    [Fact]
    public async Task A_remnant_can_be_sold_instead_of_cutting_fresh_stock_and_a_leftover_becomes_a_smaller_remnant()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);
        var remnant = new Remnant { ProductId = product.Id, BranchId = branch.Id, Qty = 3m, LengthM = 3m, Status = RemnantStatus.Available };
        db.Remnants.Add(remnant);
        await db.SaveChangesAsync();

        // Cut 2m from the 3m remnant instead of bulk stock — no bulk stock should move at all.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, consumeRemnantId = remnant.Id, remnantAction = "Restock" }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        var line = order.GetProperty("lines")[0];
        Assert.Equal(2m, line.GetProperty("qty").GetDecimal());
        Assert.Equal(0m, line.GetProperty("stockQty").GetDecimal());

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(200m, stock.OnHand); // untouched — the cut came off the remnant, not bulk stock

        var original = await db.Remnants.AsNoTracking().SingleAsync(r => r.Id == remnant.Id);
        Assert.Equal(RemnantStatus.Sold, original.Status);
        Assert.Equal(0m, original.Qty);

        var child = await db.Remnants.AsNoTracking().SingleAsync(r => r.Id != remnant.Id && r.ProductId == product.Id);
        Assert.Equal(1m, child.Qty);
        Assert.Equal(RemnantStatus.Available, child.Status);

        var movements = await db.StockMovements.AsNoTracking().Where(m => m.ProductId == product.Id).ToListAsync();
        Assert.Contains(movements, m => m.Type == StockMovementType.RemnantConsumed && m.Qty == -2m);
    }

    [Fact]
    public async Task A_remnant_smaller_than_the_requested_cut_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);
        var remnant = new Remnant { ProductId = product.Id, BranchId = branch.Id, Qty = 1m, LengthM = 1m, Status = RemnantStatus.Available };
        db.Remnants.Add(remnant);
        await db.SaveChangesAsync();

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, consumeRemnantId = remnant.Id }], payAmount: 8m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("smaller than", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Voiding_a_sale_that_consumed_an_untouched_remnant_restores_the_remnant_not_bulk_stock()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, client) = SeedContext(db, cutToSizeUnit: "Length", onHand: 200m, sellingPrice: 4m);
        var remnant = new Remnant { ProductId = product.Id, BranchId = branch.Id, Qty = 3m, LengthM = 3m, Status = RemnantStatus.Available };
        db.Remnants.Add(remnant);
        await db.SaveChangesAsync();

        var checkout = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id,
            [new { productId = product.Id, qty = 0m, lengthM = 2m, consumeRemnantId = remnant.Id, remnantAction = "Scrap" }], payAmount: 8m));
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
        var orderId = (await checkout.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var voidResponse = await client.PutAsJsonAsync($"/api/pos/orders/{orderId}/void", new { reason = "Remnant void test", reasonCode = "TrainingError" });
        Assert.Equal(HttpStatusCode.OK, voidResponse.StatusCode);

        var stock = await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id);
        Assert.Equal(200m, stock.OnHand); // never touched by this sale, so unaffected by its void too

        var restored = await db.Remnants.AsNoTracking().SingleAsync(r => r.Id == remnant.Id);
        Assert.Equal(3m, restored.Qty); // the full original piece is back, scrapped leftover included
        Assert.Equal(RemnantStatus.Available, restored.Status);
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

    // FinanceController.Approve's non-Damaged restock loop was taught to run RemnantReversal instead
    // of blindly restocking OnHand for a remnant-tracked line (see its own doc comment) — but every
    // cut-to-size product (the only kind that can ever carry a Remnant) is already blocked from
    // Standard/Surplus returns entirely by a pre-existing rule (only Damaged is accepted, which
    // quarantines and never restocks). That fix is therefore purely defensive today: it only pays off
    // if that non-returnable rule is ever relaxed. This test guards that the rule itself still holds
    // after these changes, rather than exercising a return path that's actually unreachable.
    [Fact]
    public async Task Standard_returns_of_a_cut_to_size_remnant_tracked_product_stay_blocked()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db, code: "GLS2", nameEn: "Glass2");
        var product = TestDataSeeder.AddProduct(db, category, sku: "GLASS-REMNANT-RET", nameEn: "Clear Glass 6mm",
            sellingPrice: 4m, vatRate: 0m, stockUom: "m", isCutToSize: true, cutToSizeUnit: "Length");
        TestDataSeeder.AddBranchStock(db, product, branch, 200m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Finance]);
        role.CanAuthorizeDamagedReturns = true;
        role.SurplusReturnCeilingAmount = null;
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, role, "remnant-return-supervisor@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(supervisor);

        var remnant = new Remnant { ProductId = product.Id, BranchId = branch.Id, Qty = 0m, Status = RemnantStatus.Sold };
        db.Remnants.Add(remnant);
        db.SaveChanges();
        var line = new OrderLine
        {
            ProductId = product.Id, Qty = 2m, Uom = "m", StockQty = 0m, LengthM = 2m,
            UnitPrice = 4m, VatRate = 0m, LineTotal = 8m,
            SourceQty = 3m, RemnantQty = 1m, RemnantAction = "Scrap", ConsumedRemnantId = remnant.Id,
        };
        var order = new Order
        {
            OrderNo = $"ORD-REMNANT-{Guid.NewGuid().ToString()[..8]}",
            BranchId = branch.Id, CashierUserId = supervisor.Id,
            Status = OrderStatus.Completed, PaymentStatus = PaymentStatus.Paid,
            SubTotal = 8m, VatTotal = 0m, GrandTotal = 8m,
            Lines = [line],
        };
        order.Payments.Add(new OrderPayment { Method = PaymentMethod.Cash, Amount = 8m });
        db.Orders.Add(order);
        db.SaveChanges();

        var create = await client.PostAsJsonAsync("/api/finance/returns", new
        {
            orderId = order.Id, type = "Standard", reason = "customer changed mind",
            lines = new[] { new { orderLineId = line.Id, qty = 2m } },
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Contains("non-returnable", await create.Content.ReadAsStringAsync());
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
