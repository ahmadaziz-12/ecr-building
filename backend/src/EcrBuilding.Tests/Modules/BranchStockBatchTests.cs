using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Inventory;
using EcrBuilding.Application.Procurement;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// 2026-07-27: the Expiry page only ever tracked batch/expiry for WAREHOUSE stock (StockBatch) —
/// once goods reached a branch's own sellable stock (BranchStockLevel, via PO receive or a stock
/// transfer), all batch/expiry metadata was silently dropped, so shelf-life-sensitive goods sitting
/// at the till were invisible to expiry management. BranchStockBatch closes that gap.
/// </summary>
public class BranchStockBatchTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static Supplier AddSupplier(AppDbContext db, string code = "SUP1")
    {
        var supplier = new Supplier { Code = code, NameEn = "Test Supplier", Currency = "SAR" };
        db.Suppliers.Add(supplier);
        db.SaveChanges();
        return supplier;
    }

    private static void AddPurchasingGlAccounts(AppDbContext db) =>
        db.Accounts.AddRange(
            new Account { Code = "1200", Name = "Inventory", Type = AccountType.Asset },
            new Account { Code = "2000", Name = "Accounts Payable", Type = AccountType.Liability },
            new Account { Code = "5100", Name = "Operating Expenses", Type = AccountType.Expense });

    [Fact]
    public async Task Receiving_a_PO_with_no_warehouse_link_still_creates_a_branch_batch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        var supplier = AddSupplier(db);
        AddPurchasingGlAccounts(db);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Buyer", fullAccessModules: [ModuleArea.Suppliers, ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "buyer3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // No WarehouseId on the line — the branch still physically receives the goods.
        var create = await client.PostAsJsonAsync("/api/procurement/purchase-orders", new CreatePurchaseOrderRequest(
            supplier.Id, "SAR", DateTime.UtcNow.AddDays(5), 0, null, null,
            [new PoLineInput(product.Id, branch.Id, null, 50, 20m, null, "B-2026-100", DateTime.UtcNow.AddMonths(6))]));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var po = await create.Content.ReadFromJsonAsync<PurchaseOrderDto>();
        var lineId = po!.Lines[0].Id;

        var submit = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/submit", new { });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var approve = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/approve", new ApprovePurchaseOrderRequest(null));
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var receive = await client.PutAsJsonAsync($"/api/procurement/purchase-orders/{po.Id}/receive",
            new ReceivePurchaseOrderRequest([new ReceiveLineInput(lineId, 50, null, null)]));
        var body = await receive.Content.ReadAsStringAsync();
        Assert.True(receive.StatusCode == HttpStatusCode.OK, $"Expected OK, got {receive.StatusCode}: {body}");

        var branchBatches = await client.GetFromJsonAsync<List<StockBatchDto>>("/api/inventory/branch-stock-batches");
        Assert.NotNull(branchBatches);
        var batch = Assert.Single(branchBatches!);
        Assert.Equal("B-2026-100", batch.BatchNo);
        Assert.Equal(50m, batch.Qty);
        Assert.Equal("Branch", batch.Scope);
        Assert.Equal(branch.NameEn, batch.WarehouseName);
    }

    [Fact]
    public async Task Transferring_a_batch_from_warehouse_to_branch_moves_it_off_the_warehouse_and_onto_the_branch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, stockUom: "Bag");
        var level = new StockLevel { ProductId = product.Id, WarehouseId = warehouse.Id, OnHand = 100m };
        db.StockLevels.Add(level);
        var batch = new StockBatch
        {
            ProductId = product.Id, WarehouseId = warehouse.Id, BatchNo = "B-2026-200",
            ReceivedDate = DateTime.UtcNow, ExpiryDate = DateTime.UtcNow.AddMonths(3), Qty = 100m,
        };
        db.StockBatches.Add(batch);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "wh2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var create = await client.PostAsJsonAsync("/api/inventory/transfers", new CreateStockTransferRequest(
            warehouse.Id, null, null, branch.Id, null, null, null,
            [new TransferLineInput(product.Id, 30m, 20m, "B-2026-200", batch.ExpiryDate)]));
        var createBody = await create.Content.ReadAsStringAsync();
        Assert.True(create.StatusCode == HttpStatusCode.OK, $"Expected OK, got {create.StatusCode}: {createBody}");
        var transfer = await create.Content.ReadFromJsonAsync<StockTransferDto>();

        var submit = await client.PutAsync($"/api/inventory/transfers/{transfer!.Id}/submit", null);
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var approve = await client.PutAsJsonAsync($"/api/inventory/transfers/{transfer.Id}/approve", new ApproveStockTransferRequest(null));
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var dispatch = await client.PutAsync($"/api/inventory/transfers/{transfer.Id}/dispatch", null);
        var dispatchBody = await dispatch.Content.ReadAsStringAsync();
        Assert.True(dispatch.StatusCode == HttpStatusCode.OK, $"Expected OK, got {dispatch.StatusCode}: {dispatchBody}");
        var receive = await client.PutAsync($"/api/inventory/transfers/{transfer.Id}/receive", null);
        var receiveBody = await receive.Content.ReadAsStringAsync();
        Assert.True(receive.StatusCode == HttpStatusCode.OK, $"Expected OK, got {receive.StatusCode}: {receiveBody}");

        using var verifyDb = _factory.CreateDbContext();
        Assert.Equal(70m, verifyDb.StockBatches.First(b => b.Id == batch.Id).Qty); // 100 - 30 dispatched
        var branchBatch = verifyDb.BranchStockBatches.First(b => b.ProductId == product.Id && b.BranchId == branch.Id);
        Assert.Equal(30m, branchBatch.Qty);
        Assert.Equal("B-2026-200", branchBatch.BatchNo);
    }

    [Fact]
    public async Task Writing_off_a_branch_batch_decrements_branch_stock_and_zeroes_the_batch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        product.CostPrice = 15m;
        db.Accounts.AddRange(
            new Account { Code = "1200", Name = "Inventory", Type = AccountType.Asset },
            new Account { Code = "5100", Name = "Operating Expenses", Type = AccountType.Expense });
        TestDataSeeder.AddBranchStock(db, product, branch, onHand: 60m);
        var branchBatch = new BranchStockBatch
        {
            ProductId = product.Id, BranchId = branch.Id, BatchNo = "B-2026-300",
            ReceivedDate = DateTime.UtcNow, ExpiryDate = DateTime.UtcNow.AddDays(-1), Qty = 20m,
        };
        db.BranchStockBatches.Add(branchBatch);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "BranchStaff", fullAccessModules: [ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "branchstaff@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var writeOff = await client.PutAsync($"/api/inventory/branch-stock-batches/{branchBatch.Id}/write-off", null);
        var body = await writeOff.Content.ReadAsStringAsync();
        Assert.True(writeOff.StatusCode == HttpStatusCode.OK, $"Expected OK, got {writeOff.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        Assert.Equal(0m, verifyDb.BranchStockBatches.First(b => b.Id == branchBatch.Id).Qty);
        Assert.Equal(40m, verifyDb.BranchStockLevels.First(s => s.ProductId == product.Id && s.BranchId == branch.Id).OnHand); // 60 - 20
        Assert.True(verifyDb.StockMovements.Any(m => m.ProductId == product.Id && m.Type == StockMovementType.WriteOff && m.Qty == -20m));
        var inventoryAccount = verifyDb.Accounts.First(a => a.Code == "1200");
        Assert.True(verifyDb.JournalLines.Any(l => l.AccountId == inventoryAccount.Id && l.Credit == 300m)); // 20 * 15
    }
}
