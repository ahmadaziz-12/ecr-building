using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Delivery Orders "Split": once an order lands Failed / PartiallyDelivered / ReturnedToBranch,
/// whatever wasn't delivered (Ordered - DeliveredQty - DamagedQty per line) can be carried into a
/// brand-new DeliveryOrder for redelivery, instead of the sales order's undelivered remainder being
/// stuck with no way to redispatch it. Mirrors the Move request/approve permission split
/// (DeliveryStageMovePermissionTests) since it reuses the exact same ApprovalRequest pipeline.
/// </summary>
public class DeliveryOrderSplitTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object SplitRequest(string note = "Retry redelivery") => new
    {
        promisedDate = DateTime.UtcNow.AddDays(2), promisedTime = "10:00", timeSlot = (string?)null,
        driverId = (int?)null, vehicleId = (int?)null, note,
    };

    private static (Branch branch, Product product, DeliveryOrder order) SeedPartiallyDeliveredOrder(AppDbContext db)
    {
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch, stage: DeliveryStage.PartiallyDelivered);
        order.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 10m, Uom = "Bag", UnitWeight = 50m, DeliveryQty = 10m, LoadedQty = 10m, DeliveredQty = 6m, DamagedQty = 1m });
        db.SaveChanges();
        return (branch, product, order);
    }

    [Fact]
    public async Task Full_access_user_splits_the_remainder_into_a_new_delivery_order_directly()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, order) = SeedPartiallyDeliveredOrder(db);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Supervisor", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "supervisor@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("applied").GetBoolean());
        var newOrder = body.GetProperty("order");
        Assert.Equal("Pending", newOrder.GetProperty("stage").GetString());
        Assert.Equal(order.Id, newOrder.GetProperty("sourceDeliveryOrderId").GetInt32());
        var lines = newOrder.GetProperty("lines").EnumerateArray().ToList();
        var line = Assert.Single(lines);
        Assert.Equal(product.Id, line.GetProperty("productId").GetInt32());
        Assert.Equal(3m, line.GetProperty("ordered").GetDecimal()); // 10 ordered - 6 delivered - 1 damaged = 3 remaining

        using var verifyDb = _factory.CreateDbContext();
        var created = verifyDb.DeliveryOrders.Include(o => o.Lines).Single(o => o.SourceDeliveryOrderId == order.Id);
        Assert.Equal(3m, created.Lines.Single().Ordered);
    }

    [Fact]
    public async Task Edit_only_user_files_a_pending_split_request_and_no_order_is_created_yet()
    {
        using var db = _factory.CreateDbContext();
        var (branch, _, order) = SeedPartiallyDeliveredOrder(db);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Edit));
        var user = TestDataSeeder.AddUser(db, role, "dispatcher@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("applied").GetBoolean());
        Assert.Equal("Pending", body.GetProperty("pendingApproval").GetProperty("status").GetString());

        using var verifyDb = _factory.CreateDbContext();
        Assert.Empty(verifyDb.DeliveryOrders.Where(o => o.SourceDeliveryOrderId == order.Id));
    }

    [Fact]
    public async Task A_different_full_access_user_can_approve_the_split_and_the_new_order_is_created()
    {
        using var db = _factory.CreateDbContext();
        var (branch, product, order) = SeedPartiallyDeliveredOrder(db);
        var editRole = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher2", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Edit));
        var fullRole = TestDataSeeder.AddRoleWithLevels(db, "Supervisor2", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Full));
        var requester = TestDataSeeder.AddUser(db, editRole, "dispatcher2@test.local", branchId: branch.Id);
        var approver = TestDataSeeder.AddUser(db, fullRole, "supervisor2@test.local", branchId: branch.Id);
        var requesterClient = _factory.CreateAuthenticatedClient(requester);
        var approverClient = _factory.CreateAuthenticatedClient(approver);

        var requestResponse = await requesterClient.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());
        var requestBody = await requestResponse.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = requestBody.GetProperty("pendingApproval").GetProperty("id").GetInt32();

        var approveResponse = await approverClient.PutAsync($"/api/delivery/orders/approvals/{approvalId}/approve", null);

        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);
        var approveBody = await approveResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(approveBody.GetProperty("applied").GetBoolean());
        Assert.Equal(order.Id, approveBody.GetProperty("order").GetProperty("sourceDeliveryOrderId").GetInt32());

        using var verifyDb = _factory.CreateDbContext();
        var created = verifyDb.DeliveryOrders.Include(o => o.Lines).Single(o => o.SourceDeliveryOrderId == order.Id);
        Assert.Equal(3m, created.Lines.Single(l => l.ProductId == product.Id).Ordered);
    }

    [Fact]
    public async Task Cannot_split_an_order_that_is_still_in_progress()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch, stage: DeliveryStage.Dispatched);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Supervisor3", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "supervisor3@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Cannot split", body);
    }

    [Fact]
    public async Task Cannot_split_an_order_a_second_time_while_the_first_split_is_still_active()
    {
        using var db = _factory.CreateDbContext();
        var (branch, _, order) = SeedPartiallyDeliveredOrder(db);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Supervisor4", (Domain.Enums.ModuleArea.Delivery, Domain.Enums.AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "supervisor4@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);
        var first = await client.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync($"/api/delivery/orders/{order.Id}/split", SplitRequest());

        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        var body = await second.Content.ReadAsStringAsync();
        Assert.Contains("already been split", body);
    }
}
