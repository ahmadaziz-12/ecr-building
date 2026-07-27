using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// BRD §3.5 "Delivery Order Creation" — a POS checkout with at least one delivery-flagged line must
/// auto-generate a DeliveryOrder (forwarded to dispatch) without a separate manual step, support
/// mixing flagged/unflagged lines in the same sale (partial delivery), auto-calculate the delivery
/// fee from a zone, and surface the resulting delivery status back on the OrderDto for POS screens.
/// </summary>
public class PosCheckoutDeliveryTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Branch branch, Product pickup, Product delivery) SeedTwoProducts(AppDbContext db)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var pickup = TestDataSeeder.AddProduct(db, category, sku: "PICKUP-001", sellingPrice: 50m, vatRate: 0m);
        var delivery = TestDataSeeder.AddProduct(db, category, sku: "DELIVER-001", nameEn: "Portland Cement 50kg (bulk)", sellingPrice: 100m, vatRate: 0m);
        TestDataSeeder.AddBranchStock(db, pickup, branch);
        TestDataSeeder.AddBranchStock(db, delivery, branch);
        TestDataSeeder.AddStandardGlAccounts(db);
        return (branch, pickup, delivery);
    }

    private static object DeliveryDetails(int? zoneId = null) => new
    {
        addressType = "Customer Address", contactName = "Ahmed Al-Rashid", contactMobile = "0500000000", city = "Riyadh",
        district = (string?)null, street = (string?)null, landmark = (string?)null, instructions = (string?)null,
        promisedDate = DateTime.UtcNow.AddDays(1), promisedTime = "10:00", timeSlot = (string?)null, priority = "Standard",
        driverId = (int?)null, vehicleId = (int?)null, zoneId, weightTons = (decimal?)null,
    };

    [Fact]
    public async Task Checkout_with_a_delivery_flagged_line_auto_creates_a_delivery_order_with_only_that_line()
    {
        using var db = _factory.CreateDbContext();
        var (branch, pickup, delivery) = SeedTwoProducts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new object[]
            {
                new { productId = pickup.Id, qty = 1m, requiresDelivery = false },
                new { productId = delivery.Id, qty = 1m, requiresDelivery = true },
            },
            payments = new[] { new { method = "Cash", amount = 150m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
            delivery = DeliveryDetails(),
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual(JsonValueKind.Null, order.GetProperty("deliveryOrderId").ValueKind);
        Assert.Equal("Pending", order.GetProperty("deliveryStage").GetString());

        using var verifyDb = _factory.CreateDbContext();
        var orderId = order.GetProperty("id").GetInt32();
        var deliveryOrder = await verifyDb.DeliveryOrders.Include(d => d.Lines).SingleAsync(d => d.OrderId == orderId);
        Assert.Single(deliveryOrder.Lines);
        Assert.Equal(delivery.Id, deliveryOrder.Lines.Single().ProductId);
        Assert.Equal(100m, deliveryOrder.Amount);
        Assert.Equal(DeliveryStage.Pending, deliveryOrder.Stage);
    }

    [Fact]
    public async Task Checkout_with_no_delivery_flagged_lines_creates_no_delivery_order()
    {
        using var db = _factory.CreateDbContext();
        var (branch, pickup, _) = SeedTwoProducts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier2", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier2@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new[] { new { productId = pickup.Id, qty = 1m } },
            payments = new[] { new { method = "Cash", amount = 50m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, order.GetProperty("deliveryOrderId").ValueKind);

        using var verifyDb = _factory.CreateDbContext();
        Assert.False(await verifyDb.DeliveryOrders.AnyAsync(d => d.OrderId == order.GetProperty("id").GetInt32()));
    }

    [Fact]
    public async Task Delivery_fee_auto_calculates_from_the_selected_zone()
    {
        using var db = _factory.CreateDbContext();
        var (branch, _, delivery) = SeedTwoProducts(db);
        var zone = TestDataSeeder.AddDeliveryZone(db, name: "North Riyadh", fee: 75m);
        var role = TestDataSeeder.AddRole(db, "Cashier3", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new[] { new { productId = delivery.Id, qty = 1m, requiresDelivery = true } },
            payments = new[] { new { method = "Cash", amount = 100m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
            delivery = DeliveryDetails(zone.Id),
        });

        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected OK, got {response.StatusCode}: {body}");
        var order = await response.Content.ReadFromJsonAsync<JsonElement>();

        using var verifyDb = _factory.CreateDbContext();
        var orderId = order.GetProperty("id").GetInt32();
        var deliveryOrder = await verifyDb.DeliveryOrders.SingleAsync(d => d.OrderId == orderId);
        Assert.Equal(75m, deliveryOrder.FeeCharge);
        Assert.Equal(Math.Round(75m * 0.15m, 2), deliveryOrder.VatCharge);
    }

    [Fact]
    public async Task Getting_the_order_afterward_still_reflects_the_delivery_status()
    {
        using var db = _factory.CreateDbContext();
        var (branch, _, delivery) = SeedTwoProducts(db);
        var role = TestDataSeeder.AddRole(db, "Cashier4", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier4@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(cashier);

        var checkoutResponse = await client.PostAsJsonAsync("/api/pos/orders", new
        {
            branchId = branch.Id, terminalId = (int?)null, customerId = (int?)null, type = "Retail",
            lines = new[] { new { productId = delivery.Id, qty = 1m, requiresDelivery = true } },
            payments = new[] { new { method = "Cash", amount = 100m } },
            couponCode = (string?)null, manualDiscount = (object?)null, customFees = (object?)null, notes = (string?)null,
            delivery = DeliveryDetails(),
        });
        var created = await checkoutResponse.Content.ReadFromJsonAsync<JsonElement>();
        var orderId = created.GetProperty("id").GetInt32();
        var deliveryOrderNo = created.GetProperty("deliveryOrderNo").GetString();

        var getResponse = await client.GetAsync($"/api/pos/orders/{orderId}");

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var fetched = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(deliveryOrderNo, fetched.GetProperty("deliveryOrderNo").GetString());
        Assert.Equal("Pending", fetched.GetProperty("deliveryStage").GetString());

        var listResponse = await client.GetAsync("/api/pos/orders");
        var list = await listResponse.Content.ReadFromJsonAsync<JsonElement[]>();
        var listed = list!.Single(o => o.GetProperty("id").GetInt32() == orderId);
        Assert.Equal(deliveryOrderNo, listed.GetProperty("deliveryOrderNo").GetString());
    }
}
