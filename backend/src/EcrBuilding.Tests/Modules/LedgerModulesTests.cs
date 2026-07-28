using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Pos;
using EcrBuilding.Application.Procurement;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Ledger-completion pass (2026-07-27): closes the "balance mutated in place with no audit trail"
/// gap across Customer AR, Supplier AP, Cash/Till, and warehouse stock write-offs. The Customer/
/// Supplier ledgers are both reconstructed from GL postings (JournalEntries filtered by that
/// account's own references), the same pattern — a sale/return/payment posts to a real GL account
/// under its own reference number, and the ledger endpoint just replays those postings back.
/// </summary>
public class LedgerModulesTests : IAsyncLifetime
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

    private static void AddArAccount(AppDbContext db) =>
        db.Accounts.Add(new Account { Code = "1100", Name = "Accounts Receivable", Type = AccountType.Asset });

    [Fact]
    public async Task AccountCredit_checkout_posts_to_accounts_receivable_and_shows_in_the_customer_ledger()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        TestDataSeeder.AddStandardGlAccounts(db); // now includes 1100
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B, creditLimit: 500m, outstanding: 0m);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var checkout = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = customer.Id, type = "Contractor",
            lines = new[] { new { productId = product.Id, qty = 1m } },
            payments = new[] { new { method = "AccountCredit", amount = 100m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
        });
        var checkoutBody = await checkout.Content.ReadAsStringAsync();
        Assert.True(checkout.StatusCode == HttpStatusCode.OK, $"Expected OK, got {checkout.StatusCode}: {checkoutBody}");

        // The sale must never touch Cash & Bank for the AccountCredit portion — only Accounts Receivable.
        using var verifyDb = _factory.CreateDbContext();
        var cashAccount = verifyDb.Accounts.First(a => a.Code == "1000");
        var arAccount = verifyDb.Accounts.First(a => a.Code == "1100");
        Assert.False(verifyDb.JournalLines.Any(l => l.AccountId == cashAccount.Id && l.Debit == 100m));
        Assert.True(verifyDb.JournalLines.Any(l => l.AccountId == arAccount.Id && l.Debit == 100m));

        var ledger = await client.GetFromJsonAsync<List<CustomerLedgerLineDto>>($"/api/pos/customers/{customer.Id}/ledger");
        Assert.NotNull(ledger);
        Assert.Single(ledger!);
        Assert.Equal(100m, ledger![0].Debit);
    }

    [Fact]
    public async Task RecordPayment_reduces_outstanding_and_appears_in_the_customer_ledger()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        AddArAccount(db);
        db.Accounts.Add(new Account { Code = "1000", Name = "Cash & Bank", Type = AccountType.Asset });
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "cashier2@test.local", branchId: branch.Id);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B, creditLimit: 500m, outstanding: 300m);
        var client = _factory.CreateAuthenticatedClient(user);

        var pay = await client.PostAsJsonAsync($"/api/pos/customers/{customer.Id}/payments",
            new RecordCustomerPaymentRequest(120m, "BankTransfer", "REF-1", null));
        var payBody = await pay.Content.ReadAsStringAsync();
        Assert.True(pay.StatusCode == HttpStatusCode.OK, $"Expected OK, got {pay.StatusCode}: {payBody}");

        using var verifyDb = _factory.CreateDbContext();
        Assert.Equal(180m, verifyDb.Customers.First(c => c.Id == customer.Id).Outstanding);

        var ledger = await client.GetFromJsonAsync<List<CustomerLedgerLineDto>>($"/api/pos/customers/{customer.Id}/ledger");
        Assert.NotNull(ledger);
        Assert.Single(ledger!);
        Assert.Equal(120m, ledger![0].Credit);
    }

    [Fact]
    public async Task Non_b2b_customer_cannot_record_a_payment()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "cashier3@test.local", branchId: branch.Id);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        var client = _factory.CreateAuthenticatedClient(user);

        var pay = await client.PostAsJsonAsync($"/api/pos/customers/{customer.Id}/payments",
            new RecordCustomerPaymentRequest(50m, "Cash", null, null));

        Assert.Equal(HttpStatusCode.BadRequest, pay.StatusCode);
    }

    [Fact]
    public async Task Paying_a_supplier_posts_ap_and_appears_in_the_supplier_ledger()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        db.Accounts.AddRange(
            new Account { Code = "1000", Name = "Cash & Bank", Type = AccountType.Asset },
            new Account { Code = "2000", Name = "Accounts Payable", Type = AccountType.Liability });
        db.SaveChanges();
        var supplier = AddSupplier(db);
        var role = TestDataSeeder.AddRole(db, "Buyer", fullAccessModules: [ModuleArea.Suppliers]);
        var user = TestDataSeeder.AddUser(db, role, "buyer2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var pay = await client.PostAsJsonAsync($"/api/procurement/suppliers/{supplier.Id}/payments",
            new RecordSupplierPaymentRequest(750m, "BankTransfer", "WIRE-9", "Settling PO-2026-0001"));
        var payBody = await pay.Content.ReadAsStringAsync();
        Assert.True(pay.StatusCode == HttpStatusCode.OK, $"Expected OK, got {pay.StatusCode}: {payBody}");

        var ledger = await client.GetFromJsonAsync<List<SupplierLedgerLineDto>>($"/api/procurement/suppliers/{supplier.Id}/ledger");
        Assert.NotNull(ledger);
        Assert.Equal(2, ledger!.Count); // AP debit line + Cash credit line
        Assert.Contains(ledger, l => l.AccountCode == "2000" && l.Debit == 750m);
        Assert.Contains(ledger, l => l.AccountCode == "1000" && l.Credit == 750m);
    }

    [Fact]
    public async Task Cash_in_and_out_are_itemized_on_the_shift()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new Terminal { Code = "T1", Name = "Terminal 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier4@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var open = await client.PostAsJsonAsync("/api/pos/cashier-shifts/open", new { terminalId = terminal.Id, openingFloat = 200m });
        Assert.Equal(HttpStatusCode.OK, open.StatusCode);
        var shift = await open.Content.ReadFromJsonAsync<CashierShiftDto>();
        Assert.NotNull(shift);

        var cashIn = await client.PutAsJsonAsync($"/api/pos/cashier-shifts/{shift!.Id}/cash-movement?direction=in",
            new CashMovementRequest(500m, "Change fund top-up"));
        Assert.Equal(HttpStatusCode.OK, cashIn.StatusCode);
        var cashOut = await client.PutAsJsonAsync($"/api/pos/cashier-shifts/{shift.Id}/cash-movement?direction=out",
            new CashMovementRequest(50m, "Petty cash — cleaning supplies"));
        Assert.Equal(HttpStatusCode.OK, cashOut.StatusCode);

        var movements = await client.GetFromJsonAsync<List<CashMovementDto>>($"/api/pos/cashier-shifts/{shift.Id}/movements");
        Assert.NotNull(movements);
        Assert.Equal(2, movements!.Count);
        Assert.Equal("In", movements[0].Direction);
        Assert.Equal(500m, movements[0].Amount);
        Assert.Equal("Out", movements[1].Direction);
        Assert.Equal(50m, movements[1].Amount);
    }

    [Fact]
    public async Task Writing_off_a_batch_decrements_warehouse_stock_and_zeroes_the_batch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var warehouse = TestDataSeeder.AddWarehouse(db, branch);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        product.CostPrice = 20m;
        db.Accounts.AddRange(
            new Account { Code = "1200", Name = "Inventory", Type = AccountType.Asset },
            new Account { Code = "5100", Name = "Operating Expenses", Type = AccountType.Expense });
        var level = new StockLevel { ProductId = product.Id, WarehouseId = warehouse.Id, OnHand = 40m };
        db.StockLevels.Add(level);
        var batch = new StockBatch
        {
            ProductId = product.Id, WarehouseId = warehouse.Id, BatchNo = "B1",
            ReceivedDate = DateTime.UtcNow, ExpiryDate = DateTime.UtcNow.AddDays(-1), Qty = 15m,
        };
        db.StockBatches.Add(batch);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Warehouse", fullAccessModules: [ModuleArea.Inventory]);
        var user = TestDataSeeder.AddUser(db, role, "wh@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var writeOff = await client.PutAsync($"/api/inventory/stock-batches/{batch.Id}/write-off", null);
        var body = await writeOff.Content.ReadAsStringAsync();
        Assert.True(writeOff.StatusCode == HttpStatusCode.OK, $"Expected OK, got {writeOff.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        Assert.Equal(0m, verifyDb.StockBatches.First(b => b.Id == batch.Id).Qty);
        Assert.Equal(25m, verifyDb.StockLevels.First(s => s.Id == level.Id).OnHand); // 40 - 15
        Assert.True(verifyDb.StockMovements.Any(m => m.ProductId == product.Id && m.Type == StockMovementType.WriteOff && m.Qty == -15m));

        var inventoryAccount = verifyDb.Accounts.First(a => a.Code == "1200");
        Assert.True(verifyDb.JournalLines.Any(l => l.AccountId == inventoryAccount.Id && l.Credit == 300m)); // 15 * 20
    }
}
