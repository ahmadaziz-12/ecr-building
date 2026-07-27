using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Module 3 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — B2B credit limit enforcement (BRD §4.2).
/// AccountCredit is a ledger entry against Customer.Outstanding/CreditLimit, not a real payment rail.
/// All test products use SellingPrice=100, Qty=1, VatRate=0 so GrandTotal is exactly 100 per unit.
/// </summary>
public class Module3CreditLimitTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Product product, User cashier) SeedFixture(AppDbContext db)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, product, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        return (branch, product, cashier);
    }

    private static object CheckoutRequest(int branchId, int customerId, int productId, decimal amount, int? overrideId = null) => new
    {
        branchId,
        terminalId = (int?)null,
        customerId,
        type = "Contractor",
        lines = new[] { new { productId, qty = 1m } },
        payments = new[] { new { method = "AccountCredit", amount } },
        couponCode = (string?)null,
        manualDiscount = (object?)null,
        customFees = (object?)null,
        notes = (string?)null,
        creditOverrideApprovalRequestId = overrideId,
    };

    [Fact]
    public async Task Credit_sale_within_limit_succeeds_and_increases_outstanding()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, cashier) = SeedFixture(db);
        // CustomerType.B2B (not Contractor) — Contractor triggers OrdersController's automatic 5% trade
        // discount, which would make GrandTotal 95 instead of 100 and complicate this test's math.
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B, creditLimit: 500m, outstanding: 0m);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, 100m));

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(100m, updated.Outstanding);
    }

    [Fact]
    public async Task Credit_sale_that_would_exceed_the_limit_is_blocked_without_approval()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, cashier) = SeedFixture(db);
        // Limit 500, already 450 outstanding — a further 100 would land at 550, over the limit.
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B, creditLimit: 500m, outstanding: 450m);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, 100m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("over their", body);

        using var verifyDb = _factory.CreateDbContext();
        var unchanged = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(450m, unchanged.Outstanding);
    }

    [Fact]
    public async Task Supervisor_approved_override_lets_the_over_limit_sale_complete()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, cashier) = SeedFixture(db);
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor@test.local", branchId: branch.Id);
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.B2B, creditLimit: 500m, outstanding: 450m);

        var cashierClient = _factory.CreateAuthenticatedClient(cashier);
        var createApproval = await cashierClient.PostAsJsonAsync("/api/pos/approvals", new
        {
            type = "CreditOverride", branchId = branch.Id, amount = 100m, reason = "Urgent project material", relatedOrderId = (int?)null,
        });
        Assert.Equal(HttpStatusCode.OK, createApproval.StatusCode);
        var approval = await createApproval.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = approval.GetProperty("id").GetInt32();

        var supervisorClient = _factory.CreateAuthenticatedClient(supervisor);
        var approveResponse = await supervisorClient.PutAsync($"/api/pos/approvals/{approvalId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);

        var checkout = await cashierClient.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, customer.Id, product.Id, 100m, approvalId));

        var checkoutBody = await checkout.Content.ReadAsStringAsync();
        Assert.True(checkout.StatusCode == HttpStatusCode.OK, $"Expected OK, got {checkout.StatusCode}: {checkoutBody}");

        using var verifyDb = _factory.CreateDbContext();
        var updated = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(550m, updated.Outstanding);
    }

    [Fact]
    public async Task Cash_payment_is_never_blocked_by_a_b2b_customers_outstanding_balance()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, cashier) = SeedFixture(db);
        // Already well over what their limit would allow for credit — but paying cash, not account credit.
        var customer = TestDataSeeder.AddCustomer(db, type: CustomerType.Contractor, creditLimit: 100m, outstanding: 90m);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var request = new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = customer.Id, type = "Contractor",
            lines = new[] { new { productId = product.Id, qty = 1m } },
            payments = new[] { new { method = "Cash", amount = 95m } }, // 100 * (1 - 5% contractor discount)
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
        };

        var response = await client.PostAsJsonAsync("/api/pos/orders", request);

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");

        using var verifyDb = _factory.CreateDbContext();
        var unchanged = verifyDb.Customers.First(c => c.Id == customer.Id);
        Assert.Equal(90m, unchanged.Outstanding); // Cash payment must never touch Outstanding.
    }

    [Fact]
    public async Task Account_credit_is_rejected_for_a_non_b2b_customer()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, cashier) = SeedFixture(db);
        var retailCustomer = TestDataSeeder.AddCustomer(db, type: CustomerType.Retail, creditLimit: 0m, outstanding: 0m);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", CheckoutRequest(branch.Id, retailCustomer.Id, product.Id, 100m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("only available for B2B", body);
    }
}
