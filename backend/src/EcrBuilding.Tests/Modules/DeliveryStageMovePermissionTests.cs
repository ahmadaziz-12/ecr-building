using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Delivery Orders "move to next stage": a role with only Edit on the Delivery Orders page can only
/// file a move request; one with Approve moves directly and is who approves/rejects someone else's
/// pending request — mirrors the POS discount request/approve pattern
/// (Module1DiscountAuthorizationTests) but keyed off the page-level PermissionAction.Approve bit
/// instead of a numeric ceiling, since Delivery has no per-action ceiling concept.
/// </summary>
public class DeliveryStageMovePermissionTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object TransitionRequest(string toStage) => new { toStage, driverId = (int?)null, vehicleId = (int?)null, lines = (object?)null, receivedBy = (string?)null, proof = (string?)null, failureReason = (string?)null, nextAction = (string?)null, note = (string?)null };

    [Fact]
    public async Task Edit_only_user_files_a_pending_request_instead_of_moving_the_order()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher", (ModuleArea.Delivery, AccessLevel.Edit));
        var user = TestDataSeeder.AddUser(db, role, "dispatcher@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Cancelled"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("applied").GetBoolean());
        Assert.Equal("Pending", body.GetProperty("order").GetProperty("stage").GetString());
        Assert.Equal("Pending", body.GetProperty("pendingApproval").GetProperty("status").GetString());

        using var verifyDb = _factory.CreateDbContext();
        var stillPending = verifyDb.DeliveryOrders.Single(o => o.Id == order.Id);
        Assert.Equal(DeliveryStage.Pending, stillPending.Stage);
    }

    [Fact]
    public async Task Full_access_user_moves_the_order_directly_with_no_approval_step()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Supervisor", (ModuleArea.Delivery, AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "supervisor@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Cancelled"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("applied").GetBoolean());
        Assert.Equal("Cancelled", body.GetProperty("order").GetProperty("stage").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("pendingApproval").ValueKind);
    }

    [Fact]
    public async Task A_different_full_access_user_can_approve_the_request_and_the_order_actually_moves()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        var editRole = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher2", (ModuleArea.Delivery, AccessLevel.Edit));
        var fullRole = TestDataSeeder.AddRoleWithLevels(db, "Supervisor2", (ModuleArea.Delivery, AccessLevel.Full));
        var requester = TestDataSeeder.AddUser(db, editRole, "dispatcher2@test.local", branchId: branch.Id);
        var approver = TestDataSeeder.AddUser(db, fullRole, "supervisor2@test.local", branchId: branch.Id);
        var requesterClient = _factory.CreateAuthenticatedClient(requester);
        var approverClient = _factory.CreateAuthenticatedClient(approver);

        var requestResponse = await requesterClient.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Cancelled"));
        var requestBody = await requestResponse.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = requestBody.GetProperty("pendingApproval").GetProperty("id").GetInt32();

        var approveResponse = await approverClient.PutAsync($"/api/delivery/orders/approvals/{approvalId}/approve", null);

        Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);
        var approveBody = await approveResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(approveBody.GetProperty("applied").GetBoolean());
        Assert.Equal("Cancelled", approveBody.GetProperty("order").GetProperty("stage").GetString());

        using var verifyDb = _factory.CreateDbContext();
        var moved = verifyDb.DeliveryOrders.Single(o => o.Id == order.Id);
        Assert.Equal(DeliveryStage.Cancelled, moved.Stage);
    }

    [Fact]
    public async Task Full_access_user_cannot_approve_their_own_request()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        // A user can hold Full and still, in principle, file a request via the same endpoint (e.g. if
        // permissions were downgraded mid-flight) — regardless, self-approval must stay blocked.
        var editRole = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher3", (ModuleArea.Delivery, AccessLevel.Edit));
        var fullRole = TestDataSeeder.AddRoleWithLevels(db, "Supervisor3", (ModuleArea.Delivery, AccessLevel.Full));
        var requester = TestDataSeeder.AddUser(db, editRole, "dispatcher3@test.local", branchId: branch.Id);
        var requesterClient = _factory.CreateAuthenticatedClient(requester);
        var requestResponse = await requesterClient.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Cancelled"));
        var requestBody = await requestResponse.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = requestBody.GetProperty("pendingApproval").GetProperty("id").GetInt32();

        // Promote the requester's own role to carry Approve on Delivery Orders and retry approving
        // their own request. Direct DB mutation bypasses RolesController.Update's epoch bump, so the
        // resolver's per-user cache (populated by the request above) is invalidated explicitly here —
        // the same thing that endpoint does after a real permission edit.
        foreach (var perm in db.RolePermissions.Where(p => p.RoleId == editRole.Id && p.ModuleKey == "/delivery/orders"))
        {
            perm.CanView = perm.CanCreate = perm.CanEdit = perm.CanDelete = perm.CanApprove = perm.CanExport = true;
        }
        var epoch = db.PermissionsEpochs.FirstOrDefault();
        if (epoch is null) db.PermissionsEpochs.Add(new PermissionsEpoch { Value = 1 });
        else epoch.Value++;
        db.SaveChanges();
        using (var scope = _factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<IPermissionResolver>().InvalidateEpoch();
        }
        var selfClient = _factory.CreateAuthenticatedClient(requester);

        var approveResponse = await selfClient.PutAsync($"/api/delivery/orders/approvals/{approvalId}/approve", null);

        Assert.Equal(HttpStatusCode.BadRequest, approveResponse.StatusCode);
        var body = await approveResponse.Content.ReadAsStringAsync();
        Assert.Contains("cannot approve your own request", body);
    }

    [Fact]
    public async Task Rejecting_a_request_leaves_the_order_stage_unchanged()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        var editRole = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher4", (ModuleArea.Delivery, AccessLevel.Edit));
        var fullRole = TestDataSeeder.AddRoleWithLevels(db, "Supervisor4", (ModuleArea.Delivery, AccessLevel.Full));
        var requester = TestDataSeeder.AddUser(db, editRole, "dispatcher4@test.local", branchId: branch.Id);
        var approver = TestDataSeeder.AddUser(db, fullRole, "supervisor4@test.local", branchId: branch.Id);
        var requesterClient = _factory.CreateAuthenticatedClient(requester);
        var approverClient = _factory.CreateAuthenticatedClient(approver);
        var requestResponse = await requesterClient.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Cancelled"));
        var requestBody = await requestResponse.Content.ReadFromJsonAsync<JsonElement>();
        var approvalId = requestBody.GetProperty("pendingApproval").GetProperty("id").GetInt32();

        var rejectResponse = await approverClient.PutAsync($"/api/delivery/orders/approvals/{approvalId}/reject", null);

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        var rejectBody = await rejectResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Rejected", rejectBody.GetProperty("status").GetString());

        using var verifyDb = _factory.CreateDbContext();
        var untouched = verifyDb.DeliveryOrders.Single(o => o.Id == order.Id);
        Assert.Equal(DeliveryStage.Pending, untouched.Stage);
    }

    [Fact]
    public async Task Edit_only_user_still_gets_guard_validation_before_a_request_is_ever_created()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        // Assigning requires a driver + vehicle — the pure Validate() path must catch this exactly
        // like the direct-apply path does, without ever writing a bogus ApprovalRequest row.
        var order = TestDataSeeder.AddDeliveryOrder(db, branch);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Dispatcher5", (ModuleArea.Delivery, AccessLevel.Edit));
        var user = TestDataSeeder.AddUser(db, role, "dispatcher5@test.local", branchId: branch.Id);
        var client = _factory.CreateAuthenticatedClient(user);

        var response = await client.PutAsJsonAsync($"/api/delivery/orders/{order.Id}/transition", TransitionRequest("Assigned"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Assigning requires a driver and a vehicle", body);

        using var verifyDb = _factory.CreateDbContext();
        Assert.Empty(verifyDb.ApprovalRequests.Where(a => a.Type == ApprovalType.DeliveryStageChange));
    }
}
