using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// One cashier, one terminal at a time: Open Shift already rejected a second concurrent shift on the
/// SAME terminal (any cashier) — this covers the other half, the same cashier trying to open a
/// second shift on a DIFFERENT terminal while their first one is still open.
/// </summary>
public class CashierShiftOpenValidationTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Rejects_a_second_open_shift_for_a_cashier_who_already_has_one_elsewhere()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminalA = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        var terminalB = new Terminal { Code = "TRM-02", Name = "Till 2", BranchId = branch.Id };
        db.Terminals.AddRange(terminalA, terminalB);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminalA.Id, CashierUserId = cashier.Id, OpeningFloat = 500m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/cashier-shifts/open", new { terminalId = terminalB.Id, openingFloat = 1000m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Contains("Till 1", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Allows_opening_a_new_shift_once_the_cashiers_previous_one_is_closed()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var terminalA = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        var terminalB = new Terminal { Code = "TRM-02", Name = "Till 2", BranchId = branch.Id };
        db.Terminals.AddRange(terminalA, terminalB);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", branchId: branch.Id);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminalA.Id, CashierUserId = cashier.Id, OpeningFloat = 500m, Status = CashierShiftStatus.Closed,
        });
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var response = await client.PostAsJsonAsync("/api/pos/cashier-shifts/open", new { terminalId = terminalB.Id, openingFloat = 1000m });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_supervisor_opening_shift_on_an_assigned_terminal_attributes_it_to_the_assigned_cashier()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var cashierRole = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var supervisorRole = TestDataSeeder.AddRole(db, "Supervisor", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, cashierRole, "cashier@test.local", branchId: branch.Id);
        var supervisor = TestDataSeeder.AddUser(db, supervisorRole, "supervisor@test.local", branchId: branch.Id);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id, OperatorUserId = cashier.Id };
        db.Terminals.Add(terminal);
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(supervisor);

        var response = await client.PostAsJsonAsync("/api/pos/cashier-shifts/open", new { terminalId = terminal.Id, openingFloat = 1000m });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<CashierShiftDto>();
        Assert.Equal(cashier.Name, dto!.CashierName);

        using var verifyDb = _factory.CreateDbContext();
        var shift = verifyDb.CashierShifts.Single(s => s.TerminalId == terminal.Id);
        Assert.Equal(cashier.Id, shift.CashierUserId);
    }

    [Fact]
    public async Task Shift_terminal_picker_surfaces_the_assigned_cashier()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "cashier@test.local", "Yousef Al-Malki", branch.Id);
        var terminal = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id, OperatorUserId = cashier.Id };
        db.Terminals.Add(terminal);
        db.SaveChanges();
        var client = _factory.CreateAuthenticatedClient(cashier);

        var rows = await client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/pos/cashier-shifts/terminals");

        var row = Assert.Single(rows!);
        Assert.Equal(cashier.Id, row.GetProperty("assignedCashierId").GetInt32());
        Assert.Equal("Yousef Al-Malki", row.GetProperty("assignedCashierName").GetString());
    }
}
