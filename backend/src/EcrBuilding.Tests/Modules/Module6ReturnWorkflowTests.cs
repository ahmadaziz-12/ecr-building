using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>Module 6 unit tests — the pure Return Value Calculation math (BRD §3.2.3/§3.2.4).</summary>
public class Module6ReturnMathTests
{
    [Fact]
    public void Refund_is_priced_at_what_the_customer_actually_paid_including_line_discount()
    {
        // 10 units at 100 with a 5% line discount → lineTotal 950, price paid 95/unit.
        var refund = ReturnMath.RefundForLine(qtyReturned: 2, lineQty: 10, lineTotal: 950, vatRate: 15);
        Assert.Equal(190m, refund.BaseRefund);
        Assert.Equal(28.50m, refund.VatReversal);
    }

    [Fact]
    public void Restocking_fee_reduces_cashback_and_net_combines_all_three_components()
    {
        var fee = ReturnMath.RestockingFee(190m, 5m);
        Assert.Equal(9.50m, fee);
        Assert.Equal(209m, ReturnMath.NetCashback(190m, 28.50m, 9.50m));
    }

    [Fact]
    public void Mixed_method_payments_split_the_cashback_proportionally_and_sum_exactly()
    {
        var split = ReturnMath.ProportionalSplit([("Cash", 300m), ("Mada", 700m)], 100m);
        Assert.Equal(30m, split.Single(s => s.Method == "Cash").Amount);
        Assert.Equal(70m, split.Single(s => s.Method == "Mada").Amount);

        // Rounding remainder lands on the largest payment so the split always sums to the refund.
        var uneven = ReturnMath.ProportionalSplit([("Cash", 1m), ("Mada", 1m), ("StcPay", 1m)], 100m);
        Assert.Equal(100m, uneven.Sum(s => s.Amount));
    }
}

/// <summary>
/// Module 6 integration tests — the three-way Standard/Damaged/Surplus return workflow
/// (BRD §3.2, acceptance criteria 5-8).
/// </summary>
public class Module6ReturnWorkflowTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private sealed record Context(AppDbContext Db, Branch Branch, Category Category, Product Product, User Supervisor, HttpClient SupervisorClient);

    /// <summary>Supervisor-tier user (damaged auth + uncapped returns) with Pos/Orders/Finance access.</summary>
    private Context SeedReturnContext(decimal restockingFeePct = 0, bool productReturnable = true)
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        category.SurplusRestockingFeePct = restockingFeePct;
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 15m);
        product.Returnable = productReturnable;
        db.SaveChanges();
        TestDataSeeder.AddBranchStock(db, product, branch, 1_000m);
        TestDataSeeder.AddWarehouse(db, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Finance]);
        role.CanAuthorizeDamagedReturns = true;
        role.SurplusReturnCeilingAmount = null;
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, role, "returns-supervisor@test.local", branchId: branch.Id);
        return new Context(db, branch, category, product, supervisor, _factory.CreateAuthenticatedClient(supervisor));
    }

    /// <summary>A completed, cash-paid order written directly to the DB (full control over CreatedAt).</summary>
    private static Order SeedCompletedOrder(Context ctx, decimal qty = 10m, decimal unitPrice = 100m, decimal vatRate = 15m,
        decimal? stockQty = null, DateTime? createdAt = null, params (PaymentMethod Method, decimal Amount)[] payments)
    {
        var lineTotal = Math.Round(qty * unitPrice, 2);
        var order = new Order
        {
            OrderNo = $"ORD-TEST-{Guid.NewGuid().ToString()[..8]}",
            BranchId = ctx.Branch.Id, CashierUserId = ctx.Supervisor.Id,
            Status = OrderStatus.Completed, PaymentStatus = PaymentStatus.Paid,
            SubTotal = lineTotal, VatTotal = Math.Round(lineTotal * vatRate / 100, 2),
            GrandTotal = Math.Round(lineTotal * (1 + vatRate / 100), 2),
            Lines = [new OrderLine { ProductId = ctx.Product.Id, Qty = qty, Uom = ctx.Product.StockUom, StockQty = stockQty ?? qty, UnitPrice = unitPrice, VatRate = vatRate, LineTotal = lineTotal }],
        };
        foreach (var (method, amount) in payments.Length > 0 ? payments : [(PaymentMethod.Cash, order.GrandTotal)])
        {
            order.Payments.Add(new OrderPayment { Method = method, Amount = amount });
        }
        ctx.Db.Orders.Add(order);
        ctx.Db.SaveChanges();
        if (createdAt is not null)
        {
            order.CreatedAt = createdAt.Value; // interceptor only stamps CreatedAt on insert
            ctx.Db.SaveChanges();
        }
        return order;
    }

    private static object ReturnRequest(int orderId, string type, object[] lines, string reason = "test return",
        string? damageCode = null, string? photoRef = null, int? windowOverrideId = null) => new
    {
        orderId, type, reason, lines,
        damageReasonCode = damageCode, photoReference = photoRef, windowOverrideApprovalRequestId = windowOverrideId,
    };

    [Fact]
    public async Task Created_and_listed_returns_surface_the_originating_sale_s_branch_and_cashier()
    {
        // 2026-07-25 fix: the Return Ledger's "Branch"/"Cashier" columns and filters had nothing to
        // read — a Return has no branch of its own, it inherits the original sale's via Order. Guards
        // ReturnsController.WithIncludes()/Map() actually project Order.Branch/Order.Cashier through.
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx);
        var lineId = order.Lines.First().Id;

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = lineId, qty = 2m }]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(ctx.Branch.Id, created.GetProperty("branchId").GetInt32());
        Assert.Equal(ctx.Branch.NameEn, created.GetProperty("branchName").GetString());
        Assert.Equal(ctx.Supervisor.Name, created.GetProperty("cashierName").GetString());

        var list = await ctx.SupervisorClient.GetFromJsonAsync<JsonElement[]>("/api/finance/returns");
        var listed = list!.Single(r => r.GetProperty("id").GetInt32() == created.GetProperty("id").GetInt32());
        Assert.Equal(ctx.Branch.Id, listed.GetProperty("branchId").GetInt32());
        Assert.Equal(ctx.Supervisor.Name, listed.GetProperty("cashierName").GetString());
    }

    [Fact]
    public async Task Partial_returns_draw_down_per_line_and_reject_exceeding_the_remainder()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx);
        var lineId = order.Lines.First().Id;

        // Return 4 of 10 — fine.
        var first = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = lineId, qty = 4m }]));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // A second return of 7 would exceed the 6 remaining.
        var second = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = lineId, qty = 7m }]));
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        Assert.Contains("can still be returned", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Damaged_return_requires_a_reason_code_generates_a_DGRN_and_quarantines_instead_of_restocking()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx);
        var lineId = order.Lines.First().Id;

        // Without a damage reason code → rejected outright (BRD §3.2.2: mandatory).
        var noCode = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Damaged", [new { orderLineId = lineId, qty = 5m }]));
        Assert.Equal(HttpStatusCode.BadRequest, noCode.StatusCode);
        Assert.Contains("damage reason code is required", await noCode.Content.ReadAsStringAsync());

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Damaged", [new { orderLineId = lineId, qty = 5m }], damageCode: "TransitDamage", photoRef: "PHOTO-001"));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.StartsWith("DGRN-", created.GetProperty("dgrnNo").GetString());
        Assert.Equal("TransitDamage", created.GetProperty("damageReason").GetString());
        Assert.Equal("Quarantine", created.GetProperty("status").GetString());

        var stockBefore = (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id)).OnHand;
        var approve = await ctx.SupervisorClient.PutAsJsonAsync($"/api/finance/returns/{created.GetProperty("id").GetInt32()}/approve",
            new { branchId = ctx.Branch.Id, refundMethod = "StoreCredit" });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        // Sellable stock untouched; the goods sit in a quarantined batch under the DGRN number.
        var stockAfter = (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id)).OnHand;
        Assert.Equal(stockBefore, stockAfter);
        var batch = await db.StockBatches.AsNoTracking().FirstOrDefaultAsync(b => b.BatchNo == created.GetProperty("dgrnNo").GetString());
        Assert.NotNull(batch);
        Assert.Equal(StockBatchStatus.Quarantine, batch!.ManualStatus);
        Assert.Equal(5m, batch.Qty);
    }

    [Fact]
    public async Task Damaged_return_approval_is_rejected_for_users_without_damaged_authorization()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx);
        var lineId = order.Lines.First().Id;

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Damaged", [new { orderLineId = lineId, qty = 1m }], damageCode: "ManufacturingDefect"));
        var returnId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var cashierRole = TestDataSeeder.AddRole(db, "PlainCashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Finance]);
        cashierRole.SurplusReturnCeilingAmount = 500m; // cashier tier: no damaged authorization
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "plain-cashier@test.local", branchId: ctx.Branch.Id);
        var cashierClient = _factory.CreateAuthenticatedClient(cashier);

        var approve = await cashierClient.PutAsJsonAsync($"/api/finance/returns/{returnId}/approve", new { branchId = ctx.Branch.Id, refundMethod = "StoreCredit" });
        Assert.Equal(HttpStatusCode.Forbidden, approve.StatusCode);
    }

    [Fact]
    public async Task Surplus_return_applies_the_category_restocking_fee_to_cashback_but_restocks_full_quantity()
    {
        var ctx = SeedReturnContext(restockingFeePct: 5m);
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx, qty: 10m); // 10 × 100 ex-VAT, VAT 15%

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Surplus", [new { orderLineId = order.Lines.First().Id, qty = 10m }]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        // Gross 1000, VAT 150, fee 5% = 50 → net cashback 1100.
        Assert.Equal(1000m, created.GetProperty("grossRefund").GetDecimal());
        Assert.Equal(150m, created.GetProperty("vatReversal").GetDecimal());
        Assert.Equal(50m, created.GetProperty("restockingFeeAmount").GetDecimal());
        Assert.Equal(1100m, created.GetProperty("netCashback").GetDecimal());

        var stockBefore = (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id)).OnHand;
        var approve = await ctx.SupervisorClient.PutAsJsonAsync($"/api/finance/returns/{created.GetProperty("id").GetInt32()}/approve",
            new { branchId = ctx.Branch.Id, refundMethod = "StoreCredit" });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        // Fee reduces the money, never the physical reintegration (BRD §3.2.3).
        var stockAfter = (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id)).OnHand;
        Assert.Equal(stockBefore + 10m, stockAfter);
    }

    [Fact]
    public async Task Surplus_return_of_a_non_returnable_or_cut_to_size_product_is_blocked()
    {
        var ctx = SeedReturnContext(productReturnable: false);
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx);

        var blocked = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Surplus", [new { orderLineId = order.Lines.First().Id, qty = 1m }]));
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.Contains("non-returnable", await blocked.Content.ReadAsStringAsync());

        // Cut-to-size products are blocked even when otherwise returnable (BRD acceptance criterion 7).
        var glass = TestDataSeeder.AddProduct(db, ctx.Category, sku: "GLASS-CUT", nameEn: "Cut Glass", sellingPrice: 180m, vatRate: 15m, stockUom: "m²", isCutToSize: true);
        var glassOrder = new Order
        {
            OrderNo = "ORD-GLASS-1", BranchId = ctx.Branch.Id, CashierUserId = ctx.Supervisor.Id,
            Status = OrderStatus.Completed, PaymentStatus = PaymentStatus.Paid, SubTotal = 540, VatTotal = 81, GrandTotal = 621,
            Lines = [new OrderLine { ProductId = glass.Id, Qty = 3, Uom = "m²", StockQty = 3, UnitPrice = 180, VatRate = 15, LineTotal = 540, LengthM = 2.5m, WidthM = 1.2m }],
            Payments = [new OrderPayment { Method = PaymentMethod.Cash, Amount = 621 }],
        };
        db.Orders.Add(glassOrder);
        db.SaveChanges();

        var glassBlocked = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(glassOrder.Id, "Surplus", [new { orderLineId = glassOrder.Lines.First().Id, qty = 1m }]));
        Assert.Equal(HttpStatusCode.BadRequest, glassBlocked.StatusCode);
        Assert.Contains("Cut-to-size", await glassBlocked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Out_of_window_return_requires_an_approved_refund_override()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        // 20 days old — outside the 15-day standard window.
        var order = SeedCompletedOrder(ctx, createdAt: DateTime.UtcNow.AddDays(-20));
        var lineId = order.Lines.First().Id;

        var rejected = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = lineId, qty = 1m }]));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("return window", await rejected.Content.ReadAsStringAsync());

        var approval = new ApprovalRequest
        {
            Type = ApprovalType.Refund, BranchId = ctx.Branch.Id, RequestedByUserId = ctx.Supervisor.Id,
            Amount = 115m, Reason = "Out-of-window return", Status = ApprovalStatus.Approved,
        };
        db.ApprovalRequests.Add(approval);
        db.SaveChanges();

        var allowed = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = lineId, qty = 1m }], windowOverrideId: approval.Id));
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact]
    public async Task Cash_refund_above_the_threshold_requires_a_second_supervisor_pin()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx, qty: 10m); // net cashback 1150 > 500 threshold

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = order.Lines.First().Id, qty = 10m }]));
        var returnId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        // No second authorizer → blocked.
        var alone = await ctx.SupervisorClient.PutAsJsonAsync($"/api/finance/returns/{returnId}/approve",
            new { branchId = ctx.Branch.Id, refundMethod = "Cash" });
        Assert.Equal(HttpStatusCode.BadRequest, alone.StatusCode);
        Assert.Contains("second supervisor", await alone.Content.ReadAsStringAsync());

        // Second supervisor-tier user with a PIN → approved.
        var secondRole = TestDataSeeder.AddRole(db, "SecondSupervisor", fullAccessModules: ModuleArea.Finance);
        secondRole.CanAuthorizeDamagedReturns = true;
        db.SaveChanges();
        var second = TestDataSeeder.AddUser(db, secondRole, "second-supervisor@test.local", branchId: ctx.Branch.Id);
        second.PinHash = new PasswordHasher().Hash("123456");
        db.SaveChanges();

        var together = await ctx.SupervisorClient.PutAsJsonAsync($"/api/finance/returns/{returnId}/approve",
            new { branchId = ctx.Branch.Id, refundMethod = "Cash", secondAuthEmail = "second-supervisor@test.local", secondAuthPin = "123456" });
        Assert.Equal(HttpStatusCode.OK, together.StatusCode);
    }

    [Fact]
    public async Task Approver_with_a_return_value_ceiling_cannot_approve_above_it()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx, qty: 10m); // net cashback 1150

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Surplus", [new { orderLineId = order.Lines.First().Id, qty = 10m }]));
        var returnId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var cappedRole = TestDataSeeder.AddRole(db, "CappedCashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Finance]);
        cappedRole.SurplusReturnCeilingAmount = 500m;
        db.SaveChanges();
        var capped = TestDataSeeder.AddUser(db, cappedRole, "capped-cashier@test.local", branchId: ctx.Branch.Id);
        var cappedClient = _factory.CreateAuthenticatedClient(capped);

        var approve = await cappedClient.PutAsJsonAsync($"/api/finance/returns/{returnId}/approve",
            new { branchId = ctx.Branch.Id, refundMethod = "StoreCredit" });
        Assert.Equal(HttpStatusCode.Forbidden, approve.StatusCode);
        Assert.Contains("authorization limit", await approve.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Original_method_refund_splits_proportionally_across_the_original_payments()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        // Paid half cash, half Mada.
        var order = SeedCompletedOrder(ctx, qty: 2m, payments: [(PaymentMethod.Cash, 115m), (PaymentMethod.Mada, 115m)]);

        var create = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns",
            ReturnRequest(order.Id, "Standard", [new { orderLineId = order.Lines.First().Id, qty = 2m }]));
        var returnId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        // Net cashback 230 (200 + 30 VAT) — cash portion 115 ≤ 500 threshold, so no dual auth needed.
        var approve = await ctx.SupervisorClient.PutAsJsonAsync($"/api/finance/returns/{returnId}/approve", new { branchId = ctx.Branch.Id });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var approved = await approve.Content.ReadFromJsonAsync<JsonElement>();
        var splitJson = approved.GetProperty("refundSplitJson").GetString();
        Assert.NotNull(splitJson);
        var split = JsonSerializer.Deserialize<List<JsonElement>>(splitJson!)!;
        Assert.Equal(2, split.Count);
        Assert.All(split, s => Assert.Equal(115m, s.GetProperty("amount").GetDecimal()));
    }

    [Fact]
    public async Task Preview_with_no_quantities_enumerates_lines_with_max_returnable_and_flags()
    {
        var ctx = SeedReturnContext();
        using var db = ctx.Db;
        var order = SeedCompletedOrder(ctx, qty: 10m);

        var preview = await ctx.SupervisorClient.PostAsJsonAsync("/api/finance/returns/preview",
            new { orderId = order.Id, type = "Surplus", lines = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        var body = await preview.Content.ReadFromJsonAsync<JsonElement>();
        var line = body.GetProperty("lines")[0];
        Assert.Equal(10m, line.GetProperty("maxReturnableQty").GetDecimal());
        Assert.True(line.GetProperty("returnable").GetBoolean());
        Assert.Equal(100m, line.GetProperty("unitPricePaid").GetDecimal());
        Assert.Equal(0m, body.GetProperty("netCashback").GetDecimal());
    }
}
