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

    // Local mirrors of the report row shapes — the API records live in the Api project, which the
    // test project doesn't reference; only the fields asserted on are declared.
    private record SupplierReturnRow(string RtsNo, DateTime Date, string Supplier, decimal Qty, decimal Value);
    private record LowStockReportRow(string Sku, string LocationType, string Location, string Branch, decimal Available, string Status);
}
