using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Persistence.Seed;
using EcrBuilding.Infrastructure.Services;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>Modules 14/20 unit tests — EAN-13 checksum and loyalty lifecycle rules.</summary>
public class Phase3And4RulesTests
{
    [Fact]
    public void Ean13_validates_checksums_and_ignores_internal_codes()
    {
        Assert.True(Ean13.IsValidOrNotEan("6281000100011")); // checksum-valid EAN-13
        Assert.True(Ean13.IsValidOrNotEan("4006381333931")); // known-good GS1 example
        Assert.False(Ean13.IsValidOrNotEan("6281000100017")); // 13 digits, wrong check digit
        Assert.True(Ean13.IsValidOrNotEan("INT-CODE-99")); // internal code — not an EAN attempt
        Assert.True(Ean13.IsValidOrNotEan(null));
        Assert.True(Ean13.IsValidOrNotEan("12345")); // short numeric internal code
    }

    [Fact]
    public void Birthday_month_and_points_expiry_rules_follow_the_BRD()
    {
        var now = new DateTime(2026, 7, 15);
        Assert.True(LoyaltyRules.IsBirthdayMonth(new DateTime(1990, 7, 1), now));
        Assert.False(LoyaltyRules.IsBirthdayMonth(new DateTime(1990, 8, 1), now));
        Assert.False(LoyaltyRules.IsBirthdayMonth(null, now));

        const int expiryMonths = 12;
        Assert.True(LoyaltyRules.PointsExpired(now.AddMonths(-13), now, expiryMonths));
        Assert.False(LoyaltyRules.PointsExpired(now.AddMonths(-11), now, expiryMonths));
        Assert.True(LoyaltyRules.PointsExpiringSoon(now.AddMonths(-11).AddDays(-1), now, expiryMonths));
        Assert.False(LoyaltyRules.PointsExpiringSoon(now.AddMonths(-5), now, expiryMonths));
    }
}

/// <summary>Phase 3/4 integration tests across Modules 10/12/13/14/15/16/17/20.</summary>
public class Phase3And4Tests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Module14_brd_category_topup_is_idempotent_and_completes_the_14_categories()
    {
        using var db = _factory.CreateDbContext();
        TestDataSeeder.AddCategory(db); // an existing pre-BRD category
        await DbSeeder.EnsureBrdCategoriesAsync(db);
        await DbSeeder.EnsureBrdCategoriesAsync(db); // second run must add nothing

        var codes = await db.Categories.Select(c => c.Code).ToListAsync();
        Assert.Contains("CAT-GLS", codes);
        Assert.Contains("CAT-WPF", codes);
        Assert.Equal(codes.Count, codes.Distinct().Count());
        // Glass & Windows is non-returnable by nature (cut-to-size).
        Assert.False((await db.Categories.FirstAsync(c => c.Code == "CAT-GLS")).Returnable);
    }

    [Fact]
    public async Task Module14_product_round_trips_attributes_supplier_bin_and_rejects_bad_ean13()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var supplier = new Supplier { Code = "SUP1", NameEn = "Yamama Cement Co." };
        db.Suppliers.Add(supplier);
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "InvAdmin", fullAccessModules: ModuleArea.Inventory);
        var user = TestDataSeeder.AddUser(db, role, "inv14@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var badBarcode = await client.PostAsJsonAsync("/api/catalog/products", new
        {
            sku = "ATTR-1", barcode = "6281000100017", nameEn = "Bad Barcode", categoryId = category.Id,
            costPrice = 1m, sellingPrice = 2m, vatRate = 15m, stockUom = "Piece", sellUoms = Array.Empty<string>(),
            weight = 0m, returnable = true, reorderLevel = 0, reorderQty = 0,
        });
        Assert.Equal(HttpStatusCode.BadRequest, badBarcode.StatusCode);
        Assert.Contains("EAN-13", await badBarcode.Content.ReadAsStringAsync());

        var create = await client.PostAsJsonAsync("/api/catalog/products", new
        {
            sku = "ATTR-2", barcode = "6281000100011", nameEn = "Insulation Roll", categoryId = category.Id,
            costPrice = 10m, sellingPrice = 20m, vatRate = 15m, stockUom = "Roll", sellUoms = Array.Empty<string>(),
            weight = 5m, returnable = true, reorderLevel = 5, reorderQty = 20,
            attributes = new[] { new { name = "R-Value", value = "R-19" }, new { name = "Grade", value = "A" } },
            supplierId = supplier.Id, binLocation = "A2-07",
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var product = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("A2-07", product.GetProperty("binLocation").GetString());
        Assert.Equal("Yamama Cement Co.", product.GetProperty("supplierName").GetString());
        var attrs = product.GetProperty("attributes").EnumerateArray()
            .ToDictionary(a => a.GetProperty("name").GetString()!, a => a.GetProperty("value").GetString());
        Assert.Equal("R-19", attrs["R-Value"]);
    }

    [Fact]
    public async Task Module17_line_void_restores_only_that_line_and_requires_reason_code_and_authorization()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var cement = TestDataSeeder.AddProduct(db, category, sku: "V-CEM", sellingPrice: 100m, vatRate: 0m);
        var sealant = TestDataSeeder.AddProduct(db, category, sku: "V-SEAL", sellingPrice: 50m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, cement, branch, 100m);
        TestDataSeeder.AddBranchStock(db, sealant, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        // Supervisor may void alone; cashier may not.
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor17", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.CanVoidTransactions = true;
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier17", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "sup17@test.local", branchId: branch.Id);
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cash17@test.local", branchId: branch.Id);
        var supervisorClient = _factory.CreateAuthenticatedClient(supervisor);
        var cashierClient = _factory.CreateAuthenticatedClient(cashier);

        var checkout = await supervisorClient.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new object[] { new { productId = cement.Id, qty = 2m }, new { productId = sealant.Id, qty = 4m } },
            payments = new[] { new { method = "Cash", amount = 400m } },
        });
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
        var order = await checkout.Content.ReadFromJsonAsync<JsonElement>();
        var orderId = order.GetProperty("id").GetInt32();
        var sealantLineId = order.GetProperty("lines").EnumerateArray()
            .Single(l => l.GetProperty("sku").GetString() == "V-SEAL").GetProperty("id").GetInt32();

        // No reason code → rejected.
        var noCode = await supervisorClient.PutAsJsonAsync($"/api/pos/orders/{orderId}/void-line",
            new { orderLineId = sealantLineId, reason = "typo" });
        Assert.Equal(HttpStatusCode.BadRequest, noCode.StatusCode);
        Assert.Contains("reason code", await noCode.Content.ReadAsStringAsync());

        // Cashier without void authority and no authorizing manager → rejected.
        var unauthorized = await cashierClient.PutAsJsonAsync($"/api/pos/orders/{orderId}/void-line",
            new { orderLineId = sealantLineId, reason = "typo", reasonCode = "DuplicateEntry" });
        Assert.Equal(HttpStatusCode.BadRequest, unauthorized.StatusCode);
        Assert.Contains("supervisor", await unauthorized.Content.ReadAsStringAsync());

        // Supervisor voids the sealant line: its 4 units restock, the cement line stays sold.
        var voided = await supervisorClient.PutAsJsonAsync($"/api/pos/orders/{orderId}/void-line",
            new { orderLineId = sealantLineId, reason = "wrong item scanned", reasonCode = "DuplicateEntry" });
        Assert.Equal(HttpStatusCode.OK, voided.StatusCode);
        var updated = await voided.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Single(updated.GetProperty("lines").EnumerateArray());
        Assert.Equal(200m, updated.GetProperty("grandTotal").GetDecimal());

        Assert.Equal(100m, (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == sealant.Id)).OnHand);
        Assert.Equal(98m, (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == cement.Id)).OnHand);
    }

    [Fact]
    public async Task Module10_replaying_a_checkout_with_the_same_client_request_id_never_double_sells()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: "IDEM-1", sellingPrice: 10m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier10", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "cash10@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var request = new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new[] { new { productId = product.Id, qty = 3m } },
            payments = new[] { new { method = "Cash", amount = 30m } },
            clientRequestId = "offline-abc-123",
        };

        var first = await client.PostAsJsonAsync("/api/pos/orders", request);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var second = await client.PostAsJsonAsync("/api/pos/orders", request);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var firstNo = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("orderNo").GetString();
        var secondNo = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("orderNo").GetString();
        Assert.Equal(firstNo, secondNo);
        // Stock deducted once, not twice.
        Assert.Equal(97m, (await db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == product.Id)).OnHand);
    }

    [Fact]
    public async Task Module15_pin_login_issues_a_session_and_wrong_pin_fails()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier15", fullAccessModules: ModuleArea.Pos);
        var user = TestDataSeeder.AddUser(db, role, "pin15@test.local", branchId: branch.Id);
        user.PinHash = new PasswordHasher().Hash("246810");
        db.SaveChanges();
        var client = _factory.CreateClient();

        var wrong = await client.PostAsJsonAsync("/api/auth/pin-login", new { email = "pin15@test.local", pin = "000000" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);

        var right = await client.PostAsJsonAsync("/api/auth/pin-login", new { email = "pin15@test.local", pin = "246810" });
        Assert.Equal(HttpStatusCode.OK, right.StatusCode);
        var me = await right.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("pin15@test.local", me.GetProperty("email").GetString());
    }

    [Fact]
    public async Task Module16_quotation_requires_project_code_and_customer_reference_and_defaults_to_15_days()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: "Q-1", sellingPrice: 10m, vatRate: 15m);
        var role = TestDataSeeder.AddRole(db, "Cashier16", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "q16@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var missing = await client.PostAsJsonAsync("/api/pos/quotations", new
        {
            branchId = branch.Id, customerId = (int?)null, lines = new[] { new { productId = product.Id, qty = 5m } },
            validUntil = (DateTime?)null, notes = (string?)null,
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Contains("project code", await missing.Content.ReadAsStringAsync());

        var ok = await client.PostAsJsonAsync("/api/pos/quotations", new
        {
            branchId = branch.Id, customerId = (int?)null, lines = new[] { new { productId = product.Id, qty = 5m } },
            validUntil = (DateTime?)null, notes = (string?)null, projectCode = "PRJ-100", customerReference = "REF-77",
        });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var quotation = await ok.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("PRJ-100", quotation.GetProperty("projectCode").GetString());
        var validUntil = quotation.GetProperty("validUntil").GetDateTime();
        Assert.InRange((validUntil - DateTime.UtcNow).TotalDays, 14.5, 15.5);
    }

    [Fact]
    public async Task Module20_points_expire_after_12_months_of_inactivity_with_an_audit_ledger_row()
    {
        using var db = _factory.CreateDbContext();
        var lapsed = TestDataSeeder.AddCustomer(db, nameEn: "Lapsed Customer", type: CustomerType.Retail);
        lapsed.LoyaltyEnrolled = true;
        lapsed.LoyaltyPoints = 300;
        lapsed.LastPurchaseAt = DateTime.UtcNow.AddMonths(-13);
        var active = TestDataSeeder.AddCustomer(db, nameEn: "Active Customer", type: CustomerType.Retail);
        active.LoyaltyEnrolled = true;
        active.LoyaltyPoints = 200;
        active.LastPurchaseAt = DateTime.UtcNow.AddMonths(-2);
        db.SaveChanges();

        var expired = await LoyaltyPointsExpiryService.ExpireAsync(db, DateTime.UtcNow);

        Assert.Equal(1, expired);
        Assert.Equal(0, (await db.Customers.AsNoTracking().FirstAsync(c => c.Id == lapsed.Id)).LoyaltyPoints);
        Assert.Equal(200, (await db.Customers.AsNoTracking().FirstAsync(c => c.Id == active.Id)).LoyaltyPoints);
        var ledger = await db.LoyaltyTransactions.AsNoTracking().FirstOrDefaultAsync(t => t.CustomerId == lapsed.Id);
        Assert.NotNull(ledger);
        Assert.Equal(-300, ledger!.Points);
        Assert.Contains("expired", ledger.Description, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Module12_reports_reconcile_with_the_seeded_transactions()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sku: "RPT-1", sellingPrice: 100m, vatRate: 15m);
        TestDataSeeder.AddBranchStock(db, product, branch, 100m);
        TestDataSeeder.AddStandardGlAccounts(db);
        var role = TestDataSeeder.AddRole(db, "Insights12", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders, ModuleArea.Insights]);
        var user = TestDataSeeder.AddUser(db, role, "rpt12@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        // 2 × 100 + 15% VAT = 230, paid cash.
        var checkout = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new[] { new { productId = product.Id, qty = 2m } },
            payments = new[] { new { method = "Cash", amount = 230m } },
        });
        Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);

        var summary = await (await client.GetAsync("/api/insights/reports/sales-summary")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(230m, summary.GetProperty("netSales").GetDecimal());
        Assert.Equal(30m, summary.GetProperty("vat").GetDecimal());
        Assert.Equal(230m, summary.GetProperty("byMethod")[0].GetProperty("amount").GetDecimal());

        var vat = await (await client.GetAsync("/api/insights/reports/vat")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(30m, vat.GetProperty("totalCollected").GetDecimal());
        var rateRow = vat.GetProperty("collected")[0];
        Assert.Equal(15m, rateRow.GetProperty("rate").GetDecimal());
        Assert.Equal(200m, rateRow.GetProperty("taxableAmount").GetDecimal());

        var top = await (await client.GetAsync("/api/insights/reports/top-products")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("RPT-1", top[0].GetProperty("sku").GetString());
        Assert.Equal(200m, top[0].GetProperty("revenue").GetDecimal());
    }
}
