using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Finance &gt; Pricing "Approve"/"Activate": every rule created through the UI starts
/// PendingApproval and normally needs a *different* user to activate it (maker-checker). A
/// Full-access Finance user is the exception — they already hold standing authority to approve
/// anyone else's rule, so requiring a second such user to sign off their own is pure friction, not
/// a real control. Edit-level users (who can create/edit rules but don't hold that standing
/// authority) still need someone else to activate.
/// </summary>
public class PricingRuleApprovalTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object CreateRequest(string name) => new
    {
        name, type = "Coupon", scope = "All branches", condition = "Any", action = "-10%",
        priority = 10, validUntil = (DateTime?)null, code = (string?)null, discountType = "Percentage", value = 10m,
    };

    [Fact]
    public async Task Full_access_finance_user_can_activate_the_rule_they_just_created()
    {
        using var db = _factory.CreateDbContext();
        var role = TestDataSeeder.AddRoleWithLevels(db, "FinanceOwner", (ModuleArea.Finance, AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "finance-full@test.local");
        var client = _factory.CreateAuthenticatedClient(user);

        var createResponse = await client.PostAsJsonAsync("/api/finance/pricing-rules", CreateRequest("Full Self Approve"));
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ruleId = created.GetProperty("id").GetInt32();
        Assert.Equal("PendingApproval", created.GetProperty("status").GetString());

        var activateResponse = await client.PutAsJsonAsync($"/api/finance/pricing-rules/{ruleId}/status", new { status = "Active" });

        Assert.Equal(HttpStatusCode.OK, activateResponse.StatusCode);
        var activated = await activateResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Active", activated.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Edit_only_finance_user_cannot_activate_their_own_rule()
    {
        using var db = _factory.CreateDbContext();
        var role = TestDataSeeder.AddRoleWithLevels(db, "FinanceEditor", (ModuleArea.Finance, AccessLevel.Edit));
        var user = TestDataSeeder.AddUser(db, role, "finance-edit@test.local");
        var client = _factory.CreateAuthenticatedClient(user);

        var createResponse = await client.PostAsJsonAsync("/api/finance/pricing-rules", CreateRequest("Edit Self Approve"));
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ruleId = created.GetProperty("id").GetInt32();

        var activateResponse = await client.PutAsJsonAsync($"/api/finance/pricing-rules/{ruleId}/status", new { status = "Active" });

        Assert.Equal(HttpStatusCode.BadRequest, activateResponse.StatusCode);
        var body = await activateResponse.Content.ReadAsStringAsync();
        Assert.Contains("cannot approve your own pricing rule", body);
    }

    [Fact]
    public async Task A_different_edit_level_user_can_still_activate_someone_elses_rule()
    {
        using var db = _factory.CreateDbContext();
        var role = TestDataSeeder.AddRoleWithLevels(db, "FinanceEditor2", (ModuleArea.Finance, AccessLevel.Edit));
        var creator = TestDataSeeder.AddUser(db, role, "finance-edit-creator@test.local");
        var approver = TestDataSeeder.AddUser(db, role, "finance-edit-approver@test.local");
        var creatorClient = _factory.CreateAuthenticatedClient(creator);
        var approverClient = _factory.CreateAuthenticatedClient(approver);

        var createResponse = await creatorClient.PostAsJsonAsync("/api/finance/pricing-rules", CreateRequest("Different Editor Approves"));
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ruleId = created.GetProperty("id").GetInt32();

        var activateResponse = await approverClient.PutAsJsonAsync($"/api/finance/pricing-rules/{ruleId}/status", new { status = "Active" });

        Assert.Equal(HttpStatusCode.OK, activateResponse.StatusCode);
        var activated = await activateResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Active", activated.GetProperty("status").GetString());
    }
}
