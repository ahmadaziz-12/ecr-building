using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Procurement;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Real-world purchasing fix (2026-07-25): a PO line names a branch, but Receive used to credit ONLY
/// the warehouse-side StockLevel — the POS reads BranchStockLevel, so received goods were invisible
/// at the till until a separate manual stock-transfer "arrived" them at the branch. Receive now
/// credits BranchStockLevel directly (branch = the receiving branch of that line's warehouse), and
/// PO lines carry a purchasing UOM (Pallet/Ton/m²/etc, same engine as OrderLine) converted to stock
/// UOM once, at the moment stock is credited — mirroring exactly how POS checkout converts UOM.
/// </summary>
public class PurchaseOrderUomAndBranchStockTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static Supplier AddSupplier(EcrBuilding.Infrastructure.Persistence.AppDbContext db, string code = "SUP1")
    {
        var supplier = new Supplier { Code = code, NameEn = "Test Supplier", Currency = "SAR" };
        db.Suppliers.Add(supplier);
        db.SaveChanges();
        return supplier;
    }

    /// <summary>The two GL codes ProcurementController.Receive/RTS-Credit post to — distinct from
    /// TestDataSeeder.AddStandardGlAccounts, which only covers the POS-checkout sales codes.</summary>
    private static void AddPurchasingGlAccounts(EcrBuilding.Infrastructure.Persistence.AppDbContext db)
    {
        db.Accounts.AddRange(
            new Account { Code = "1200", Name = "Inventory", Type = AccountType.Asset },
            new Account { Code = "2000", Name = "Accounts Payable", Type = AccountType.Liability });
        db.SaveChanges();
    }

    [Fact]
    public async Task Receiving_a_PO_credits_the_branchs_sellable_stock_directly_not_only_the_warehouse()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        var supplier = AddSupplier(db);
        AddPurchasingGlAccounts(db); // Receive posts a GL entry when receivedValue > 0
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, branch.Id, warehouse.Id, 100, 10m, null, null, null)]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var po = await create.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.NotNull(po);
        var lineId = po!.Lines[0].Id;

        // Before receiving: nothing sellable yet at the branch (BRD-real-world: goods haven't arrived).
        using (var pre = _factory.CreateDbContext())
        {
            Assert.False(pre.BranchStockLevels.Any(s => s.ProductId == product.Id && s.BranchId == branch.Id));
        }

        var submit = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/submit", new { });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var approve = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/approve", new ApprovePurchaseOrderRequest(null));
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var receive = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/receive",
            new ReceivePurchaseOrderRequest([new ReceiveLineInput(lineId, 100, null, null)]));
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);
        var received = await receive.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.Equal("Received", received!.Status);

        // The core fix: the RECEIVING BRANCH's sellable stock — what POS checkout reads and deducts
        // from — goes up immediately on Receive. No separate transfer required.
        using var verify = _factory.CreateDbContext();
        var branchLevel = verify.BranchStockLevels.Single(s => s.ProductId == product.Id && s.BranchId == branch.Id);
        Assert.Equal(100m, branchLevel.OnHand);
        // Warehouse-side pool (bin/batch tracking) is credited too, kept in lockstep.
        var warehouseLevel = verify.StockLevels.Single(s => s.ProductId == product.Id && s.WarehouseId == warehouse.Id);
        Assert.Equal(100m, warehouseLevel.OnHand);
    }

    [Fact]
    public async Task Create_and_receive_a_PO_for_a_branch_with_no_linked_warehouse()
    {
        using var db = _factory.CreateDbContext();
        // Deliberately no TestDataSeeder.AddWarehouse(db, branch) — this branch has no warehouse link.
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        var supplier = AddSupplier(db);
        AddPurchasingGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer6@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, branch.Id, null, 100, 10m, null, null, null)]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var po = await create.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.NotNull(po);
        Assert.Null(po!.Lines[0].WarehouseId);
        var lineId = po.Lines[0].Id;

        await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/submit", new { });
        await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/approve", new ApprovePurchaseOrderRequest(null));

        var receive = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/receive",
            new ReceivePurchaseOrderRequest([new ReceiveLineInput(lineId, 100, null, null)]));
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);
        var received = await receive.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.Equal("Received", received!.Status);

        using var verify = _factory.CreateDbContext();
        // Branch's sellable stock still gets credited even with no warehouse to track bins/batches in.
        var branchLevel = verify.BranchStockLevels.Single(s => s.ProductId == product.Id && s.BranchId == branch.Id);
        Assert.Equal(100m, branchLevel.OnHand);
        Assert.False(verify.StockLevels.Any(s => s.ProductId == product.Id));
    }

    [Fact]
    public async Task PO_line_ordered_in_a_non_stock_UOM_converts_to_stock_UOM_on_receive()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        TestDataSeeder.AddUomConversion(db, product, "Pallet", 50m); // 1 Pallet = 50 Bag
        var supplier = AddSupplier(db);
        AddPurchasingGlAccounts(db); // Receive posts a GL entry when receivedValue > 0
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // Ordered 10 PALLET at 500 SAR/pallet — a real supplier invoice line, not 500 individual bags.
        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, branch.Id, warehouse.Id, 10, 500m, "Pallet", null, null)]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var po = await create.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.Equal("Pallet", po!.Lines[0].Uom);
        Assert.Equal("Bag", po.Lines[0].StockUom);
        var lineId = po.Lines[0].Id;

        await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/submit", new { });
        await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/approve", new ApprovePurchaseOrderRequest(null));

        // Receive only 4 of the 10 pallets (partial delivery) — should credit 4 × 50 = 200 Bag.
        var receive = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/receive",
            new ReceivePurchaseOrderRequest([new ReceiveLineInput(lineId, 4, null, null)]));
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);
        var received = await receive.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        Assert.Equal("PartialReceive", received!.Status);
        Assert.Equal(4m, received.Lines[0].ReceivedQty); // progress shown in the PURCHASING unit (pallets)

        using var verify = _factory.CreateDbContext();
        var branchLevel = verify.BranchStockLevels.Single(s => s.ProductId == product.Id && s.BranchId == branch.Id);
        Assert.Equal(200m, branchLevel.OnHand); // but stock is credited in STOCK unit (bags)
    }

    [Fact]
    public async Task Create_rejects_a_UOM_not_configured_for_the_product()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        var supplier = AddSupplier(db);
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, branch.Id, warehouse.Id, 10, 500m, "Container", null, null)]));

        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Create_rejects_a_warehouse_that_does_not_belong_to_the_lines_branch()
    {
        using var db = _factory.CreateDbContext();
        var riyadh = TestDataSeeder.AddBranch(db, "BR-RUH", "Riyadh");
        var jeddah = TestDataSeeder.AddBranch(db, "BR-JED", "Jeddah");
        var jeddahWarehouse = TestDataSeeder.AddWarehouse(db, jeddah, "WH-JED");
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var supplier = AddSupplier(db);
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer4@test.local", branchId: riyadh.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // Branch says Riyadh, but the warehouse belongs to Jeddah — must be rejected, not silently
        // accepted (that combination would receive goods a Riyadh sale could never see).
        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, riyadh.Id, jeddahWarehouse.Id, 10, 10m, null, null, null)]));

        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Returning_received_stock_to_the_supplier_debits_the_branchs_sellable_pool_too()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var supplier = AddSupplier(db);
        // Simulate stock already received via a PO (both pools credited, as the fix above does).
        TestDataSeeder.AddBranchStock(db, product, branch, onHand: 50m);
        db.StockLevels.Add(new StockLevel { ProductId = product.Id, WarehouseId = warehouse.Id, OnHand = 50m });
        db.SaveChanges();

        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer5@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/procurement/rts", new CreateRtsRequest(
            supplier.Id, null, branch.Id, warehouse.Id, "Damaged in transit", DateTime.UtcNow, null,
            [new RtsLineInput(product.Id, null, 20, 10m)]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var rts = await create.Content.ReadFromJsonAsync<ReturnToSupplierDto>();

        var dispatch = await client.PutAsJsonAsync($"/api/procurement/rts/{rts!.Id}/dispatch", new { });
        Assert.Equal(HttpStatusCode.OK, dispatch.StatusCode);

        using var verify = _factory.CreateDbContext();
        // Both pools drop together — the POS must never be able to sell units already shipped back.
        Assert.Equal(30m, verify.BranchStockLevels.Single(s => s.ProductId == product.Id && s.BranchId == branch.Id).OnHand);
        Assert.Equal(30m, verify.StockLevels.Single(s => s.ProductId == product.Id && s.WarehouseId == warehouse.Id).OnHand);
    }
}
