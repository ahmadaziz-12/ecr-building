using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Module 1 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — server-side discount authorization tiers
/// (BRD §6.2): Cashier ≤5%, Supervisor 5–15%, Manager &gt;15% for percentage discounts; any Fixed
/// Amount discount requires Supervisor tier or above.
///
/// All test products use SellingPrice=100, Qty=1, VatRate=0 so GrandTotal reduces to
/// 100 - discountAmount, keeping expected payment totals trivial to compute by hand.
/// </summary>
public class Module1DiscountAuthorizationTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Product product) SeedBranchAndProduct(AppDbContext db)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        return (branch, product);
    }

    private static object CheckoutRequest(int branchId, int productId, string? discountType, decimal? discountValue, decimal payAmount, int? approvalId = null) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId = (int?)null,
        type = "Retail",
        lines = new[] { new { productId, qty = 1m } },
        payments = new[] { new { method = "Cash", amount = payAmount } },
        couponCode = (string?)null,
        manualDiscount = discountType is null ? null : new { type = discountType, value = discountValue },
        customFees = (object?)null,
        notes = (string?)null,
        discountApprovalRequestId = approvalId,
    };

    [Fact]
    public async Task Cashier_can_apply_a_discount_within_their_5_percent_ceiling()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.DiscountCeilingPercent = 5m;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Percentage", 3m, payAmount: 97m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Cashier_is_blocked_from_an_8_percent_discount_without_approval()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.DiscountCeilingPercent = 5m;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Percentage", 8m, payAmount: 92m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("exceeds your authorization limit", body);
    }

    [Fact]
    public async Task Cashier_with_an_approved_discount_request_can_complete_the_over_ceiling_sale()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.DiscountCeilingPercent = 5m;
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.DiscountCeilingPercent = 15m;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier3@test.local", branchId: branch.Id);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor@test.local", branchId: branch.Id);

        // Realistic workflow: the cashier who needs the over-ceiling discount requests approval; a
        // different, higher-tier user (the supervisor) approves it.
        var cashierClient = _factory.CreateAuthenticatedClient(cashier);
        var createApproval = await cashierClient.PostAsJsonAsync("/api/pos/approvals", new
        {
            type = "Discount", branchId = branch.Id, amount = 8m, reason = "Customer loyalty gesture", relatedOrderId = (int?)null,
        });
        Assert.Equal(HttpStatusCode.OK, createApproval.StatusCode);
        var approval = await createApproval.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = approval.GetProperty("id").GetInt32();

        var supervisorClient = _factory.CreateAuthenticatedClient(supervisor);
        var approveResponse = await supervisorClient.PutAsync($"/api/pos/approvals/{approvalId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);

        var checkout = await cashierClient.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Percentage", 8m, payAmount: 92m, approvalId));

        var checkoutBody = await checkout.Content.ReadAsStringAsync();
        Assert.True(checkout.StatusCode == HttpStatusCode.OK, $"Expected OK, got {checkout.StatusCode}: {checkoutBody}");
    }

    [Fact]
    public async Task Approver_cannot_approve_their_own_discount_request()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.DiscountCeilingPercent = 15m;
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(supervisor);

        var createApproval = await client.PostAsJsonAsync("/api/pos/approvals", new
        {
            type = "Discount", branchId = branch.Id, amount = 20m, reason = "Self-serve", relatedOrderId = (int?)null,
        });
        var approval = await createApproval.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = approval.GetProperty("id").GetInt32();

        var approveResponse = await client.PutAsync($"/api/pos/approvals/{approvalId}/approve", null);

        Assert.Equal(HttpStatusCode.BadRequest, approveResponse.StatusCode);
        var body = await approveResponse.Content.ReadAsStringAsync();
        Assert.Contains("cannot approve your own request", body);
    }

    [Fact]
    public async Task Supervisor_can_apply_up_to_15_percent_directly()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.DiscountCeilingPercent = 15m;
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(supervisor);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Percentage", 12m, payAmount: 88m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Manager_with_unlimited_ceiling_can_apply_any_percentage()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var managerRole = TestDataSeeder.AddRole(db, "Store Manager", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        managerRole.DiscountCeilingPercent = null; // unlimited
        db.SaveChanges();
        var manager = TestDataSeeder.AddUser(db, managerRole, "manager@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(manager);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Percentage", 30m, payAmount: 70m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Fixed_amount_discount_is_blocked_for_a_cashier_regardless_of_size()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.DiscountCeilingPercent = 5m;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier4@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Even a tiny SAR 1 fixed discount must be blocked — BRD requires Supervisor approval for
        // ANY fixed-amount discount, not a graduated ceiling like percentage discounts.
        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Fixed", 1m, payAmount: 99m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Fixed-amount discounts require supervisor approval", body);
    }

    [Fact]
    public async Task Fixed_amount_discount_succeeds_directly_for_a_supervisor()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        supervisorRole.DiscountCeilingPercent = 15m;
        db.SaveChanges();
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor4@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(supervisor);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, product.Id, "Fixed", 10m, payAmount: 90m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Trade_account_contractor_discount_is_never_gated_by_the_manual_discount_check()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product) = SeedBranchAndProduct(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        cashierRole.DiscountCeilingPercent = 5m;
        db.SaveChanges();
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier5@test.local", branchId: branch.Id);
        var contractor = TestDataSeeder.AddCustomer(db, type: CustomerType.Contractor);
        var client = _factory.CreateAuthenticatedClient(cashier);

        // Contractor's automatic trade discount (5%, ContractorDiscountPct in OrdersController) applies
        // with no ManualDiscount at all — must never be blocked by the discount-tier check above,
        // regardless of the cashier's own ceiling.
        var request = new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = contractor.Id, type = "Retail",
            lines = new[] { new { productId = product.Id, qty = 1m } },
            payments = new[] { new { method = "Cash", amount = 95m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
        };

        var response = await client.PostAsJsonAsync("/api/pos/orders", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
