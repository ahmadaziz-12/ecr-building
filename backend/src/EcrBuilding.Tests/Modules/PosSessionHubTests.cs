using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// PosSessionHub relays a cashier's cart to a paired customer display — a dumb per-terminal relay,
/// not a payment path, so these tests cover exactly its two jobs: gate join/push behind the same
/// page permissions REST endpoints use, and fan a pushed snapshot out to every OTHER connection in
/// the terminal's group (never back to the sender).
/// </summary>
public class PosSessionHubTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private HubConnection BuildConnection(string? accessToken)
    {
        return new HubConnectionBuilder()
            .WithUrl(new Uri(_factory.Server.BaseAddress, "/hubs/pos-session"), options =>
            {
                options.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler();
                // TestServer has no real socket to upgrade — long polling works over the same
                // HttpMessageHandler-backed transport the negotiate/send/poll requests already use.
                options.Transports = HttpTransportType.LongPolling;
                if (accessToken is not null)
                {
                    options.Headers.Add("Cookie", $"access_token={accessToken}");
                }
            })
            .Build();
    }

    [Fact]
    public async Task Unauthenticated_connection_is_rejected()
    {
        await using var connection = BuildConnection(accessToken: null);

        await Assert.ThrowsAnyAsync<Exception>(() => connection.StartAsync());
    }

    [Fact]
    public async Task User_without_pos_or_display_access_cannot_join_a_terminal()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Warehouse Clerk", (ModuleArea.Inventory, AccessLevel.Full));
        var user = TestDataSeeder.AddUser(db, role, "clerk@test.local", branchId: branch.Id);
        var token = _factory.MintAccessToken(user);

        await using var connection = BuildConnection(token);
        await connection.StartAsync();

        var ex = await Assert.ThrowsAsync<HubException>(() => connection.InvokeAsync("JoinTerminal", 1));
        Assert.Contains("Not authorized", ex.Message);
    }

    [Fact]
    public async Task Pushed_cart_snapshot_reaches_the_other_connection_in_the_same_terminal_but_not_the_sender()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new EcrBuilding.Domain.Entities.Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Cashier", (ModuleArea.Pos, AccessLevel.Full));
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        db.SaveChanges();
        var token = _factory.MintAccessToken(cashier);

        await using var cashierConnection = BuildConnection(token);
        await using var displayConnection = BuildConnection(token);

        var received = new TaskCompletionSource<CustomerDisplaySnapshotDto>(TaskCreationOptions.RunContinuationsAsynchronously);
        var senderReceivedAnything = false;
        displayConnection.On<CustomerDisplaySnapshotDto>("CartUpdated", snapshot => received.TrySetResult(snapshot));
        cashierConnection.On<CustomerDisplaySnapshotDto>("CartUpdated", _ => senderReceivedAnything = true);

        await cashierConnection.StartAsync();
        await displayConnection.StartAsync();
        var terminalId = terminal.Id;
        await cashierConnection.InvokeAsync("JoinTerminal", terminalId);
        await displayConnection.InvokeAsync("JoinTerminal", terminalId);

        var snapshot = new CustomerDisplaySnapshotDto(
            Status: "Building",
            Lines: [new CustomerDisplayLineDto("Cement Bag 50kg", 10, "Bag", 20, 200)],
            Subtotal: 200,
            Discounts: [new CustomerDisplayAmountLineDto("Contractor discount 5%", 10)],
            Fees: [],
            Vat: 27.6m,
            Total: 217.6m);

        await cashierConnection.InvokeAsync("PushCartSnapshot", terminalId, snapshot);

        var result = await received.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("Building", result.Status);
        Assert.Equal(200, result.Subtotal);
        Assert.Single(result.Lines);
        Assert.Equal("Cement Bag 50kg", result.Lines[0].Name);
        Assert.Single(result.Discounts);
        Assert.Equal(27.6m, result.Vat);
        Assert.Equal(217.6m, result.Total);
        Assert.False(senderReceivedAnything);
    }

    [Fact]
    public async Task Branch_scoped_user_cannot_join_a_terminal_in_a_different_branch()
    {
        using var db = _factory.CreateDbContext();
        var ownBranch = TestDataSeeder.AddBranch(db, "BR-A", "Branch A");
        var otherBranch = TestDataSeeder.AddBranch(db, "BR-B", "Branch B");
        var otherTerminal = new EcrBuilding.Domain.Entities.Terminal { Code = "TRM-B-01", Name = "Till 1", BranchId = otherBranch.Id };
        db.Terminals.Add(otherTerminal);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Cashier", (ModuleArea.Pos, AccessLevel.Full));
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: ownBranch.Id);
        db.SaveChanges();
        var token = _factory.MintAccessToken(cashier);

        await using var connection = BuildConnection(token);
        await connection.StartAsync();

        var ex = await Assert.ThrowsAsync<HubException>(() => connection.InvokeAsync("JoinTerminal", otherTerminal.Id));
        Assert.Contains("Not authorized", ex.Message);
    }

    [Fact]
    public async Task Unscoped_hq_user_can_join_a_terminal_in_any_branch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new EcrBuilding.Domain.Entities.Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRoleWithLevels(db, "System Admin", (ModuleArea.Pos, AccessLevel.Full));
        // No branchId — an HQ/unscoped user, same semantics as GetScopedBranchId elsewhere in the app.
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local", branchId: null);
        db.SaveChanges();
        var token = _factory.MintAccessToken(admin);

        await using var connection = BuildConnection(token);
        await connection.StartAsync();

        // Would throw HubException if rejected — reaching here is the assertion.
        await connection.InvokeAsync("JoinTerminal", terminal.Id);
    }

    [Fact]
    public async Task Cashier_cannot_join_a_terminal_assigned_to_a_different_cashier_in_the_same_branch()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRoleWithLevels(db, "Cashier", (ModuleArea.Pos, AccessLevel.Full));
        var me = TestDataSeeder.AddUser(db, role, "me@test.local", branchId: branch.Id);
        var someoneElse = TestDataSeeder.AddUser(db, role, "other@test.local", branchId: branch.Id);
        var theirs = new EcrBuilding.Domain.Entities.Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id, OperatorUserId = someoneElse.Id };
        db.Terminals.Add(theirs);
        db.SaveChanges();
        var token = _factory.MintAccessToken(me);

        await using var connection = BuildConnection(token);
        await connection.StartAsync();

        var ex = await Assert.ThrowsAsync<HubException>(() => connection.InvokeAsync("JoinTerminal", theirs.Id));
        Assert.Contains("Not authorized", ex.Message);
    }

    [Fact]
    public async Task Supervisor_can_join_a_terminal_assigned_to_a_different_cashier()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var cashierRole = TestDataSeeder.AddRoleWithLevels(db, "Cashier", (ModuleArea.Pos, AccessLevel.Full));
        var supervisorRole = TestDataSeeder.AddRoleWithLevels(db, "Supervisor", (ModuleArea.Pos, AccessLevel.Full));
        supervisorRole.CanVoidTransactions = true;
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor@test.local", branchId: branch.Id);
        var theirs = new EcrBuilding.Domain.Entities.Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id, OperatorUserId = cashier.Id };
        db.Terminals.Add(theirs);
        db.SaveChanges();
        var token = _factory.MintAccessToken(supervisor);

        await using var connection = BuildConnection(token);
        await connection.StartAsync();

        // Would throw HubException if rejected — reaching here is the assertion.
        await connection.InvokeAsync("JoinTerminal", theirs.Id);
    }
}
