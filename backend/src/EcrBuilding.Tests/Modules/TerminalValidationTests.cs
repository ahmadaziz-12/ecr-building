using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Network > Terminals: Create/Update reject a duplicate code or an unknown branch with a clean 4xx
/// instead of surfacing the DB's own unique-index/FK exception, and AssignCashier enforces one
/// cashier per terminal at a time plus branch membership — audited after a stray malformed terminal
/// row + a cashier showing as assigned to two terminals simultaneously turned up in the live UI.
/// </summary>
public class TerminalValidationTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static object UpsertRequest(string code, int branchId, int? assignedCashierId = null) => new
    {
        code, name = "Till", branchId, type = "Fixed", assignedCashierId,
        offlineModeEnabled = false, ipAddress = (string?)null, macAddress = (string?)null,
    };

    [Fact]
    public async Task Create_rejects_a_duplicate_terminal_code()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        db.Terminals.Add(new Terminal { Code = "TRM-01", Name = "Existing", BranchId = branch.Id });
        db.SaveChanges();
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PostAsJsonAsync("/api/network/terminals", UpsertRequest("TRM-01", branch.Id));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_rejects_an_unknown_branch_with_a_friendly_error_not_a_db_exception()
    {
        using var db = _factory.CreateDbContext();
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PostAsJsonAsync("/api/network/terminals", UpsertRequest("TRM-NEW", 999_999));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AssignCashier_rejects_a_cashier_from_a_different_branch()
    {
        using var db = _factory.CreateDbContext();
        var branchA = TestDataSeeder.AddBranch(db, "BR-A", "Branch A");
        var branchB = TestDataSeeder.AddBranch(db, "BR-B", "Branch B");
        var terminal = new Terminal { Code = "TRM-A-01", Name = "Till 1", BranchId = branchA.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var cashierInB = TestDataSeeder.AddUser(db, cashierRole, "cashier-b@test.local", branchId: branchB.Id);
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}/assign-cashier", new { cashierUserId = cashierInB.Id });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AssignCashier_moves_the_cashier_off_whatever_other_terminal_they_were_on()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminalA = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        var terminalB = new Terminal { Code = "TRM-02", Name = "Till 2", BranchId = branch.Id };
        db.Terminals.AddRange(terminalA, terminalB);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        db.SaveChanges();
        terminalA.OperatorUserId = cashier.Id;
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminalB.Id}/assign-cashier", new { cashierUserId = cashier.Id });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var verifyDb = _factory.CreateDbContext();
        Assert.Null(verifyDb.Terminals.Single(t => t.Id == terminalA.Id).OperatorUserId);
        Assert.Equal(cashier.Id, verifyDb.Terminals.Single(t => t.Id == terminalB.Id).OperatorUserId);
    }

    [Fact]
    public async Task AssignCashier_rejects_reassignment_while_the_terminal_has_an_open_shift()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var onShift = TestDataSeeder.AddUser(db, cashierRole, "on-shift@test.local", "Yousef Al-Malki", branch.Id);
        var incoming = TestDataSeeder.AddUser(db, cashierRole, "incoming@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = onShift.Id, OpeningFloat = 1000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}/assign-cashier", new { cashierUserId = incoming.Id });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Contains("Yousef Al-Malki", body.GetProperty("error").GetString());

        using var verifyDb = _factory.CreateDbContext();
        Assert.Null(verifyDb.Terminals.Single(t => t.Id == terminal.Id).OperatorUserId);
    }

    [Fact]
    public async Task AssignCashier_allows_reassigning_to_the_same_cashier_already_on_shift()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var onShift = TestDataSeeder.AddUser(db, cashierRole, "on-shift@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = onShift.Id, OpeningFloat = 1000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}/assign-cashier", new { cashierUserId = onShift.Id });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Update_rejects_a_branch_change_while_the_terminal_has_an_open_shift()
    {
        using var db = _factory.CreateDbContext();
        var branchA = TestDataSeeder.AddBranch(db, "BR-A", "Branch A");
        var branchB = TestDataSeeder.AddBranch(db, "BR-B", "Branch B");
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branchA.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var onShift = TestDataSeeder.AddUser(db, cashierRole, "on-shift@test.local", "Yousef Al-Malki", branchA.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = onShift.Id, OpeningFloat = 1000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}", UpsertRequest("TRM-01", branchB.Id, onShift.Id));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Contains("Yousef Al-Malki", body.GetProperty("error").GetString());

        using var verifyDb = _factory.CreateDbContext();
        Assert.Equal(branchA.Id, verifyDb.Terminals.Single(t => t.Id == terminal.Id).BranchId);
    }

    [Fact]
    public async Task Update_rejects_reassigning_the_default_cashier_while_the_terminal_has_an_open_shift()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var onShift = TestDataSeeder.AddUser(db, cashierRole, "on-shift@test.local", branchId: branch.Id);
        var incoming = TestDataSeeder.AddUser(db, cashierRole, "incoming@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = onShift.Id, OpeningFloat = 1000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}", UpsertRequest("TRM-01", branch.Id, incoming.Id));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Update_allows_unrelated_field_changes_while_the_terminal_has_an_open_shift()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: [ModuleArea.Network]);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var admin = TestDataSeeder.AddUser(db, role, "admin@test.local");
        var onShift = TestDataSeeder.AddUser(db, cashierRole, "on-shift@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = onShift.Id, OpeningFloat = 1000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(admin);

        var response = await client.PutAsJsonAsync($"/api/network/terminals/{terminal.Id}", UpsertRequest("TRM-01", branch.Id, onShift.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
