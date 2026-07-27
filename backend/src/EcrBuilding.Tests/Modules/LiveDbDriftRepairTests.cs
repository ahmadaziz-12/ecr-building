using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Persistence.Seed;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Repairs for the live-DB drift class found 2026-07-25: DbSeeder only seeds EMPTY tables, so
/// databases created before Phases 1-4 never received the BRD §10.1 ladder roles/ceilings (void was
/// impossible for everyone, discounts ungated). EnsureExactlyFiveBrdRolesAsync runs every startup and
/// must repair exactly that state — and, per the later role-consolidation work, collapse any
/// non-canonical role (the old 10-role roster or an ad-hoc one) into the nearest of the BRD's 5 —
/// without clobbering admin-customized roles. Also covers the new pay-pending-order endpoint (the
/// missing back half of quotation conversion).
/// </summary>
public class LiveDbDriftRepairTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Ensure_repairs_drifted_roles_and_consolidates_legacy_roles_into_the_five()
    {
        using var db = _factory.CreateDbContext();
        // Simulate a pre-consolidation database: the old 10-role roster exists, every ceiling column
        // carries the migration backfill defaults (NULL / false), and none of the BRD's 5 canonical
        // roles exist yet.
        foreach (var name in new[] { "Owner", "Admin", "Branch Manager", "Cashier", "Warehouse Staff" })
        {
            db.Roles.Add(new Role { Name = name, IsSystem = true, ApprovalCap = 100m });
        }
        db.SaveChanges();

        await DbSeeder.EnsureExactlyFiveBrdRolesAsync(db, new PasswordHasher());

        var roles = db.Roles.ToDictionary(r => r.Name);
        // Exactly the 5 canonical roles remain — legacy ones were consolidated away, not left dangling.
        Assert.Equal(5, db.Roles.Count());
        Assert.False(db.Roles.Any(r => r.Name == "Owner" || r.Name == "Admin" || r.Name == "Branch Manager" || r.Name == "Warehouse Staff"));
        // Drifted/newly-created roles got their BRD preset ceilings.
        Assert.Equal(5m, roles["Cashier"].DiscountCeilingPercent);
        Assert.Equal(500m, roles["Cashier"].SurplusReturnCeilingAmount);
        Assert.True(roles["Store Manager"].CanVoidTransactions);
        Assert.True(roles["System Admin"].CanManageSystemConfiguration);
        Assert.Equal(10m, roles["Senior Cashier"].DiscountCeilingPercent);
        Assert.True(roles["Supervisor"].CanVoidTransactions);
        Assert.Equal(15m, roles["Supervisor"].DiscountCeilingPercent);
    }

    [Fact]
    public async Task Ensure_never_overwrites_a_customized_role_and_is_idempotent()
    {
        using var db = _factory.CreateDbContext();
        // An admin already tightened Cashier to 2% — any flag/ceiling set means "configured".
        db.Roles.Add(new Role { Name = "Cashier", IsSystem = true, DiscountCeilingPercent = 2m });
        db.SaveChanges();

        await DbSeeder.EnsureExactlyFiveBrdRolesAsync(db, new PasswordHasher());
        await DbSeeder.EnsureExactlyFiveBrdRolesAsync(db, new PasswordHasher());

        var roles = db.Roles.ToDictionary(r => r.Name);
        Assert.Equal(2m, roles["Cashier"].DiscountCeilingPercent);
        // Idempotent: the second run added nothing (one Supervisor, not two).
        Assert.Single(db.Roles.Where(r => r.Name == "Supervisor").ToList());
    }

    [Fact]
    public async Task Ensure_adds_demo_ladder_users_only_on_the_demo_dataset()
    {
        using var db = _factory.CreateDbContext();
        var role = TestDataSeeder.AddRole(db, "Cashier");
        TestDataSeeder.AddUser(db, role, "someone@a-real-tenant.example");

        await DbSeeder.EnsureExactlyFiveBrdRolesAsync(db, new PasswordHasher());
        Assert.False(db.Users.Any(u => u.Email == "supervisor.ruh@ecr-building.local"));

        // Now mark it as the demo dataset and re-run.
        TestDataSeeder.AddUser(db, role, "admin@ecr-building.local");
        await DbSeeder.EnsureExactlyFiveBrdRolesAsync(db, new PasswordHasher());
        Assert.True(db.Users.Any(u => u.Email == "supervisor.ruh@ecr-building.local"));
        Assert.True(db.Users.Any(u => u.Email == "senior-cashier.ruh@ecr-building.local"));
    }

    [Fact]
    public async Task Pay_settles_a_pending_order_and_completes_it()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        TestDataSeeder.AddStandardGlAccounts(db); // Pay now posts a GL entry on success, same as Checkout
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        var order = new Order
        {
            OrderNo = "ORD-TEST-PAY1", BranchId = branch.Id, CashierUserId = cashier.Id,
            Type = OrderType.Quotation, Status = OrderStatus.Pending, PaymentStatus = PaymentStatus.Unpaid,
            SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
        };
        db.Orders.Add(order);
        db.SaveChanges();

        var client = _factory.CreateAuthenticatedClient(cashier);
        var response = await client.PutAsJsonAsync($"/api/pos/orders/{order.Id}/pay",
            new PayOrderRequest([new PaymentInput("Cash", 115m)]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<OrderDto>();
        Assert.NotNull(dto);
        Assert.Equal("Paid", dto!.PaymentStatus);
        Assert.Equal("Completed", dto.Status);
        Assert.Single(dto.Payments);

        // Settling twice must be rejected.
        var again = await client.PutAsJsonAsync($"/api/pos/orders/{order.Id}/pay",
            new PayOrderRequest([new PaymentInput("Cash", 115m)]));
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public async Task Pay_accrues_loyalty_points_and_posts_a_GL_entry_for_an_enrolled_customer()
    {
        // Guards the fix for the gap the 2026-07-25 final audit caught: Pay originally settled
        // payment and flipped the order to Completed/Paid but skipped every side effect Checkout
        // performs on a real sale — no GL entry, no ZATCA submission attempt, and (checked here)
        // no loyalty accrual, so a converted-quotation sale silently never paid out points or hit
        // the books even though the customer paid for it in full.
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        TestDataSeeder.AddStandardGlAccounts(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m);
        var customer = new Customer { NameEn = "Loyalty Test Customer", Type = CustomerType.Retail, LoyaltyEnrolled = true, Status = EntityStatus.Active };
        db.Customers.Add(customer);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier2@test.local", branchId: branch.Id);
        db.SaveChanges();

        var order = new Order
        {
            OrderNo = "ORD-TEST-PAY3", BranchId = branch.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Type = OrderType.Quotation, Status = OrderStatus.Pending, PaymentStatus = PaymentStatus.Unpaid,
            SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
            Lines = [new OrderLine { ProductId = product.Id, Qty = 1, Uom = product.StockUom, StockQty = 1, UnitPrice = 100m, VatRate = 15m, LineTotal = 100m }],
        };
        db.Orders.Add(order);
        db.SaveChanges();

        var client = _factory.CreateAuthenticatedClient(cashier);
        var response = await client.PutAsJsonAsync($"/api/pos/orders/{order.Id}/pay",
            new PayOrderRequest([new PaymentInput("Cash", 115m)]));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<OrderDto>();
        Assert.NotNull(dto);
        // 100 SAR taxable merchandise, Bronze tier (1x), default category multiplier (1x), BRD
        // default 1 point per SAR 1 → 100 pts.
        Assert.Equal(100, dto!.LoyaltyPointsEarned);

        using var verify = _factory.CreateDbContext();
        var updatedCustomer = verify.Customers.Single(c => c.Id == customer.Id);
        Assert.Equal(100, updatedCustomer.LoyaltyPoints);
        Assert.Equal(100m, updatedCustomer.LoyaltyLifetimeSpend);
        Assert.True(verify.LoyaltyTransactions.Any(t => t.CustomerId == customer.Id && t.Type == LoyaltyTransactionType.Earn));
        // GL posted: cash/AR debited by GrandTotal, revenue+VAT credited — same accounts Checkout uses.
        Assert.True(verify.JournalEntries.Any(j => j.Reference == "ORD-TEST-PAY3"));
    }

    [Fact]
    public async Task Pay_rejects_wrong_amounts_and_checkout_only_tenders()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        var order = new Order
        {
            OrderNo = "ORD-TEST-PAY2", BranchId = branch.Id, CashierUserId = cashier.Id,
            Type = OrderType.Quotation, Status = OrderStatus.Pending, PaymentStatus = PaymentStatus.Unpaid,
            SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
        };
        db.Orders.Add(order);
        db.SaveChanges();

        var client = _factory.CreateAuthenticatedClient(cashier);

        var underpaid = await client.PutAsJsonAsync($"/api/pos/orders/{order.Id}/pay",
            new PayOrderRequest([new PaymentInput("Cash", 50m)]));
        Assert.Equal(HttpStatusCode.BadRequest, underpaid.StatusCode);

        var loyalty = await client.PutAsJsonAsync($"/api/pos/orders/{order.Id}/pay",
            new PayOrderRequest([new PaymentInput("Loyalty", 115m)]));
        Assert.Equal(HttpStatusCode.BadRequest, loyalty.StatusCode);

        using var verify = _factory.CreateDbContext();
        Assert.Equal(PaymentStatus.Unpaid, verify.Orders.Single(o => o.Id == order.Id).PaymentStatus);
    }
}
