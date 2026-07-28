using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Inventory;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Automatic Stock Count (generate → count → post) and the report-filter contract that goes with it.
///
/// Two regressions are pinned here because both were live bugs:
///   • Date windows are INCLUSIVE of the "to" day. Comparing a timestamp with `<= to` where `to`
///     came off a date picker parses as midnight and silently drops everything transacted later
///     that day — that is what made the Supplier Returns date filter look broken.
///   • List filters bind as repeated query params and must translate to SQL `IN`. On a raw T[],
///     `Contains` binds to MemoryExtensions.Contains(ReadOnlySpan&lt;T&gt;, T), which EF cannot
///     translate, so every array-valued filter 500'd until the arrays were routed through a List.
/// </summary>
public class StockCountAndReportFilterTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static StockLevel AddWarehouseStock(AppDbContext db, Product product, Warehouse warehouse, decimal onHand)
    {
        var level = new StockLevel { ProductId = product.Id, WarehouseId = warehouse.Id, OnHand = onHand };
        db.StockLevels.Add(level);
        db.SaveChanges();
        return level;
    }

    private HttpClient InventoryClient(AppDbContext db, Branch branch, string email = "counter@test.local")
    {
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Inventory, ModuleArea.Insights]);
        var user = TestDataSeeder.AddUser(db, role, email, branchId: branch.Id);
        return _factory.CreateAuthenticatedClient(user);
    }

    [Fact]
    public async Task Generating_a_count_snapshots_live_stock_so_the_sheet_is_never_typed_by_hand()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var cement = TestDataSeeder.AddProduct(db, category, sku: "CEM-001");
        var steel = TestDataSeeder.AddProduct(db, category, sku: "STL-001");
        AddWarehouseStock(db, cement, warehouse, 153m);
        AddWarehouseStock(db, steel, warehouse, 40m);
        var client = InventoryClient(db, branch);

        var response = await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, "Cycle count"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var count = await response.Content.ReadFromJsonAsync<StockCountDto>();
        Assert.NotNull(count);
        Assert.Equal("InProgress", count!.Status);
        Assert.Equal(2, count.LineCount);
        // Nothing is counted yet, and every line carries the system quantity it was generated from.
        Assert.Equal(0, count.CountedLines);
        Assert.All(count.Lines, l => Assert.Null(l.CountedQty));
        Assert.Equal(153m, count.Lines.Single(l => l.Sku == "CEM-001").SystemQty);
        Assert.Equal(40m, count.Lines.Single(l => l.Sku == "STL-001").SystemQty);
    }

    [Fact]
    public async Task A_second_open_count_on_the_same_warehouse_is_refused()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        AddWarehouseStock(db, TestDataSeeder.AddProduct(db, category), warehouse, 10m);
        var client = InventoryClient(db, branch);

        var first = await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, null));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Two open sheets would post conflicting absolute quantities for the same product.
        var second = await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Posting_a_count_applies_the_variance_to_both_stock_pools_and_records_the_movement()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: "CEM-001");
        product.CostPrice = 15.5m;
        db.SaveChanges();
        AddWarehouseStock(db, product, warehouse, 153m);
        TestDataSeeder.AddBranchStock(db, product, branch, 153m);
        var client = InventoryClient(db, branch);

        var generated = await (await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, null)))
            .Content.ReadFromJsonAsync<StockCountDto>();
        var lineId = generated!.Lines.Single().Id;

        // Counted 148 against a system 153 — five bags short.
        var saved = await client.PutAsJsonAsync($"/api/inventory/stock-counts/{generated.Id}/lines",
            new SaveStockCountLinesRequest([new StockCountLineInput(lineId, 148m, "5 bags damaged")]));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var counted = await saved.Content.ReadFromJsonAsync<StockCountDto>();
        Assert.Equal(-5m, counted!.Lines.Single().Variance);
        Assert.Equal(-77.5m, counted.Lines.Single().VarianceValue);
        Assert.Equal("Shortage", counted.Lines.Single().Status);

        var posted = await (await client.PostAsJsonAsync($"/api/inventory/stock-counts/{generated.Id}/post",
            new PostStockCountRequest(null, null))).Content.ReadFromJsonAsync<StockCountDto>();
        Assert.Equal("Completed", posted!.Status);
        Assert.NotNull(posted.StockAdjustmentId);

        using var verify = _factory.CreateDbContext();
        // Both pools land on the counted absolute quantity — same invariant StockAdjustments holds.
        Assert.Equal(148m, verify.StockLevels.Single(s => s.ProductId == product.Id && s.WarehouseId == warehouse.Id).OnHand);
        Assert.Equal(148m, verify.BranchStockLevels.Single(s => s.ProductId == product.Id && s.BranchId == branch.Id).OnHand);
        // ...and the shortage is in the ledger, signed, pointing back at the count.
        var movement = verify.StockMovements.Single(m => m.RefTable == "StockCount");
        Assert.Equal(StockMovementType.Adjustment, movement.Type);
        Assert.Equal(-5m, movement.Qty);
        Assert.Equal(generated.Id.ToString(), movement.RefId);
    }

    [Fact]
    public async Task An_uncounted_line_posts_as_a_match_when_the_count_auto_fills()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var counted = TestDataSeeder.AddProduct(db, category, sku: "CEM-001");
        var skipped = TestDataSeeder.AddProduct(db, category, sku: "STL-001");
        AddWarehouseStock(db, counted, warehouse, 10m);
        AddWarehouseStock(db, skipped, warehouse, 77m);
        var client = InventoryClient(db, branch);

        var generated = await (await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, null, AutoFillUncounted: true)))
            .Content.ReadFromJsonAsync<StockCountDto>();
        var countedLineId = generated!.Lines.Single(l => l.Sku == "CEM-001").Id;
        await client.PutAsJsonAsync($"/api/inventory/stock-counts/{generated.Id}/lines",
            new SaveStockCountLinesRequest([new StockCountLineInput(countedLineId, 10m, null)]));

        var posted = await (await client.PostAsJsonAsync($"/api/inventory/stock-counts/{generated.Id}/post",
            new PostStockCountRequest(null, null))).Content.ReadFromJsonAsync<StockCountDto>();

        Assert.Equal("Completed", posted!.Status);
        Assert.Equal(0, posted.VarianceLines);
        // The skipped line kept its system quantity rather than being written down to zero.
        using var verify = _factory.CreateDbContext();
        Assert.Equal(77m, verify.StockLevels.Single(s => s.ProductId == skipped.Id).OnHand);
    }

    [Fact]
    public async Task A_blind_count_withholds_the_system_quantity_until_it_is_posted()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        AddWarehouseStock(db, product, warehouse, 153m);
        var client = InventoryClient(db, branch);

        var generated = await (await client.PostAsJsonAsync("/api/inventory/stock-counts/generate",
            new GenerateStockCountRequest(warehouse.Id, "FullWarehouse", null, null, null, BlindCount: true)))
            .Content.ReadFromJsonAsync<StockCountDto>();

        // Withheld by the API, not merely hidden in the UI — otherwise "blind" is only a convention.
        Assert.True(generated!.BlindCount);
        Assert.Null(generated.Lines.Single().SystemQty);

        var posted = await (await client.PostAsJsonAsync($"/api/inventory/stock-counts/{generated.Id}/post",
            new PostStockCountRequest(null, null))).Content.ReadFromJsonAsync<StockCountDto>();
        Assert.Equal(153m, posted!.Lines.Single().SystemQty);
    }

    [Fact]
    public async Task Supplier_returns_report_includes_records_dated_on_the_to_day()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var supplier = new Supplier { Code = "SUP1", NameEn = "Test Supplier" };
        db.Suppliers.Add(supplier);
        db.SaveChanges();

        var today = DateTime.UtcNow.Date;
        // Timestamped mid-afternoon: `CreatedAt <= to` (to = midnight of the same day) dropped this.
        db.ReturnToSuppliers.Add(new ReturnToSupplier
        {
            RtsNo = "RTS-TODAY", SupplierId = supplier.Id, BranchId = branch.Id, WarehouseId = warehouse.Id,
            Reason = "Damaged", Date = today.AddHours(14).AddMinutes(30), Status = ReturnToSupplierStatus.Draft,
            Lines = [new ReturnToSupplierLine { ProductId = product.Id, Qty = 4, UnitCost = 15.5m }],
        });
        db.SaveChanges();
        var client = InventoryClient(db, branch);

        var from = today.AddDays(-7).ToString("yyyy-MM-dd");
        var to = today.ToString("yyyy-MM-dd");
        var rows = await client.GetFromJsonAsync<List<SupplierReturnRow>>(
            $"/api/insights/reports/supplier-returns?from={from}&to={to}");

        Assert.NotNull(rows);
        Assert.Single(rows!);
        Assert.Equal("RTS-TODAY", rows![0].RtsNo);
        Assert.Equal(62m, rows[0].Value);

        // A window that ends yesterday must still exclude it — the bound is inclusive, not ignored.
        var excluded = await client.GetFromJsonAsync<List<SupplierReturnRow>>(
            $"/api/insights/reports/supplier-returns?from={from}&to={today.AddDays(-1):yyyy-MM-dd}");
        Assert.Empty(excluded!);
    }

    [Fact]
    public async Task Report_list_filters_accept_repeated_query_params_and_mean_OR()
    {
        using var db = _factory.CreateDbContext();
        var branchA = TestDataSeeder.AddBranch(db, "BR1", "Branch A");
        var branchB = TestDataSeeder.AddBranch(db, "BR2", "Branch B");
        var warehouseA = TestDataSeeder.AddWarehouse(db, branchA, "WH1", "Yard A");
        var warehouseB = TestDataSeeder.AddWarehouse(db, branchB, "WH2", "Yard B");
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        product.ReorderLevel = 100;
        db.SaveChanges();
        AddWarehouseStock(db, product, warehouseA, 5m);
        AddWarehouseStock(db, product, warehouseB, 5m);
        var client = InventoryClient(db, branchA);

        // No filter = no constraint, never "match nothing".
        var all = await client.GetFromJsonAsync<List<LowStockReportRow>>("/api/insights/reports/low-stock?locationType=Warehouse");
        Assert.Equal(2, all!.Count);

        var oneBranch = await client.GetFromJsonAsync<List<LowStockReportRow>>(
            $"/api/insights/reports/low-stock?locationType=Warehouse&branchId={branchA.Id}");
        Assert.Single(oneBranch!);

        // Repeated params widen the result rather than intersecting to nothing.
        var bothBranches = await client.GetFromJsonAsync<List<LowStockReportRow>>(
            $"/api/insights/reports/low-stock?locationType=Warehouse&branchId={branchA.Id}&branchId={branchB.Id}");
        Assert.Equal(2, bothBranches!.Count);

        var noMatch = await client.GetFromJsonAsync<List<LowStockReportRow>>(
            "/api/insights/reports/low-stock?locationType=Warehouse&branchId=9999");
        Assert.Empty(noMatch!);
    }

    [Fact]
    public async Task Employee_audit_report_translates_its_list_filters_to_sql()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var client = InventoryClient(db, branch);

        // Regression guard: each of these used to 500 on `Contains` binding to the span overload.
        foreach (var query in new[]
        {
            "module=inventory",
            "event=STOCK_COUNT_POSTED",
            "userId=1&userId=2",
            $"branchId={branch.Id}",
            "employeeId=1",
        })
        {
            var response = await client.GetAsync($"/api/insights/reports/employee-audit?{query}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task Employee_report_scores_register_activity_without_reading_any_hr_data()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", "Sara Ali", branch.Id);

        // Two completed sales and one void. The void must never reach a revenue figure, but must be
        // counted and priced on its own so misuse is visible.
        db.Orders.AddRange(
            new Order
            {
                OrderNo = "SO-1", BranchId = branch.Id, CashierUserId = cashier.Id, Status = OrderStatus.Completed,
                SubTotal = 1000m, DiscountTotal = 100m, VatTotal = 135m, GrandTotal = 1035m,
                Lines = [new OrderLine { ProductId = product.Id, Qty = 10, StockQty = 10, UnitPrice = 100m, LineTotal = 1000m }],
            },
            new Order
            {
                OrderNo = "SO-2", BranchId = branch.Id, CashierUserId = cashier.Id, Status = OrderStatus.Delivered,
                SubTotal = 500m, DiscountTotal = 0m, VatTotal = 75m, GrandTotal = 575m,
                Lines = [new OrderLine { ProductId = product.Id, Qty = 5, StockQty = 5, UnitPrice = 100m, LineTotal = 500m }],
            },
            new Order
            {
                OrderNo = "SO-3", BranchId = branch.Id, CashierUserId = cashier.Id, Status = OrderStatus.Voided,
                SubTotal = 200m, DiscountTotal = 0m, VatTotal = 30m, GrandTotal = 230m,
            });
        db.SaveChanges();
        var client = InventoryClient(db, branch);

        var today = DateTime.UtcNow.Date;
        var rows = await client.GetFromJsonAsync<List<EmployeeReportTestRow>>(
            $"/api/insights/reports/employee-report?from={today.AddDays(-7):yyyy-MM-dd}&to={today:yyyy-MM-dd}");

        Assert.NotNull(rows);
        var row = Assert.Single(rows!, r => r.Name == "Sara Ali");
        Assert.Equal("Cashier", row.Role);
        // Delivered counts as revenue alongside Completed — filtering on Completed alone is what
        // made the dashboard and Sales Summary disagree once an order moved past the register.
        Assert.Equal(2, row.Orders);
        Assert.Equal(1500m, row.GrossSales);
        Assert.Equal(1610m, row.NetSales);
        Assert.Equal(100m, row.Discounts);
        Assert.Equal(1, row.VoidedOrders);
        Assert.Equal(230m, row.VoidedValue);
        // The drill-down carries both sales and the void, newest first.
        Assert.Equal(3, row.Items.Count);
        Assert.Contains(row.Items, i => i.Kind == "Void");

        // Role is a real constraint, and an unknown one matches nothing rather than everything.
        var noMatch = await client.GetFromJsonAsync<List<EmployeeReportTestRow>>(
            $"/api/insights/reports/employee-report?from={today.AddDays(-7):yyyy-MM-dd}&to={today:yyyy-MM-dd}&roleId=9999");
        Assert.Empty(noMatch!);
    }

    [Fact]
    public async Task Low_stock_branch_filter_returns_branch_stock_not_the_branches_warehouses()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: "CEM-001");
        product.ReorderLevel = 100;
        db.SaveChanges();
        AddWarehouseStock(db, product, warehouse, 5m);
        TestDataSeeder.AddBranchStock(db, product, branch, 5m);
        var client = InventoryClient(db, branch);

        // No filter: both grains, because that is genuinely all the low stock there is.
        var all = await client.GetFromJsonAsync<List<LowStockReportRow>>("/api/insights/reports/low-stock");
        Assert.Equal(2, all!.Count);

        // Branch filter: the branch's own stock only. Rolling its warehouses in too listed the same
        // SKU twice under two different location names, both labelled with the branch.
        var branchOnly = await client.GetFromJsonAsync<List<LowStockReportRow>>(
            $"/api/insights/reports/low-stock?branchId={branch.Id}");
        var row = Assert.Single(branchOnly!);
        Assert.Equal("Branch", row.LocationType);

        // Warehouse stock for that branch is still reachable by asking for it explicitly.
        var withWarehouses = await client.GetFromJsonAsync<List<LowStockReportRow>>(
            $"/api/insights/reports/low-stock?branchId={branch.Id}&locationType=Warehouse");
        Assert.Equal("Warehouse", Assert.Single(withWarehouses!).LocationType);
    }

    [Fact]
    public async Task Report_windows_follow_the_callers_calendar_day_not_utcs()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "night@test.local", "Night Cashier", branch.Id);

        // A sale at 01:00 Riyadh time on the 15th is 22:00 UTC on the 14th. Windowing the picked
        // calendar day as a UTC day dropped it out of "the 15th" entirely.
        var localDay = new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc);
        var order = new Order
        {
            OrderNo = "SO-NIGHT", BranchId = branch.Id, CashierUserId = cashier.Id,
            Status = OrderStatus.Completed, SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
            Lines = [new OrderLine { ProductId = product.Id, Qty = 1, StockQty = 1, UnitPrice = 100m, LineTotal = 100m }],
        };
        db.Orders.Add(order);
        db.SaveChanges();
        // CreatedAt is set by the base entity, so force it onto the boundary instant under test.
        order.CreatedAt = localDay.AddHours(-2);
        db.SaveChanges();

        var client = InventoryClient(db, branch);
        var url = "/api/insights/reports/sales-summary?from=2026-03-15&to=2026-03-15";

        // No offset header: the old behaviour, UTC days. The 22:00-on-the-14th sale is outside.
        var utcDay = await client.GetFromJsonAsync<SalesSummaryTestDto>(url);
        Assert.Equal(0, utcDay!.OrderCount);

        // UTC+3 sends getTimezoneOffset() = -180, and the sale is inside the local 15th.
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Tz-Offset", "-180");
        var localDayResult = await (await client.SendAsync(request)).Content.ReadFromJsonAsync<SalesSummaryTestDto>();
        Assert.Equal(1, localDayResult!.OrderCount);
        Assert.Equal(115m, localDayResult.NetSales);
    }

    // Local mirrors of the report row shapes — the API records live in the Api project, which the
    // test project doesn't reference; only the fields asserted on are declared.
    private record SalesSummaryTestDto(int OrderCount, decimal NetSales, decimal GrossSales);
    private record SupplierReturnRow(string RtsNo, DateTime Date, string Supplier, decimal Qty, decimal Value);
    private record LowStockReportRow(string Sku, string LocationType, string Location, string Branch, decimal Available, string Status);
    private record EmployeeActivityTestRow(DateTime Date, string Kind, string Reference);
    private record EmployeeReportTestRow(
        string Name, string Role, int Orders, decimal GrossSales, decimal NetSales, decimal Discounts,
        int VoidedOrders, decimal VoidedValue, IReadOnlyList<EmployeeActivityTestRow> Items);
}
