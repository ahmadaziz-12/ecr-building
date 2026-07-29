using System.Net;
using System.Net.Http.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// The Open Shift terminal picker (GET /api/pos/cashier-shifts/terminals).
///
/// It exists because the dialog used to read /api/network/terminals, which is gated on the Network
/// module: a cashier whose role carries POS but not Network got a 403, the dropdown rendered empty,
/// and the till looked unregistered rather than unreadable — reported as "unable to open a shift for
/// Riyadh Main Yard - Till 1 because it isn't in the list". These pin the two properties that keep
/// the till visible: the POS module alone is enough to read it, and a till someone else is on is
/// still returned (flagged busy) instead of disappearing.
/// </summary>
public class ShiftTerminalPickerTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private record TerminalRow(int Id, string Code, string Name, int BranchId, string BranchName, string Status, string? OpenShiftBlockedBy);

    [Fact]
    public async Task Cashier_without_network_access_still_sees_their_branch_tills()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        // Pos only — deliberately NO ModuleArea.Network, which is what the old endpoint required.
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "till@test.local", "Yousef Al-Malki", branch.Id);
        db.Terminals.Add(new Terminal { Code = "TRM-01", Name = $"{branch.NameEn} - Till 1", BranchId = branch.Id });
        db.SaveChanges();

        var client = _factory.CreateAuthenticatedClient(cashier);
        var response = await client.GetAsync("/api/pos/cashier-shifts/terminals");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<List<TerminalRow>>();
        var till = Assert.Single(rows!);
        Assert.Equal($"{branch.NameEn} - Till 1", till.Name);
        Assert.Equal(branch.NameEn, till.BranchName);
        Assert.Null(till.OpenShiftBlockedBy);
    }

    [Fact]
    public async Task A_till_with_an_open_shift_is_returned_flagged_busy_not_hidden()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var mine = TestDataSeeder.AddUser(db, role, "mine@test.local", "Yousef Al-Malki", branch.Id);
        var other = TestDataSeeder.AddUser(db, role, "other@test.local", "Mona Al-Harbi", branch.Id);
        var busy = new Terminal { Code = "TRM-01", Name = "Till 1", BranchId = branch.Id };
        var free = new Terminal { Code = "TRM-02", Name = "Till 2", BranchId = branch.Id };
        db.Terminals.AddRange(busy, free);
        db.SaveChanges();
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = busy.Id, CashierUserId = other.Id, OpeningFloat = 1_000m, Status = CashierShiftStatus.Open,
        });
        db.SaveChanges();

        var client = _factory.CreateAuthenticatedClient(mine);
        var rows = await client.GetFromJsonAsync<List<TerminalRow>>("/api/pos/cashier-shifts/terminals");

        Assert.Equal(2, rows!.Count);
        Assert.Equal("Mona Al-Harbi", rows.Single(t => t.Id == busy.Id).OpenShiftBlockedBy);
        Assert.Null(rows.Single(t => t.Id == free.Id).OpenShiftBlockedBy);
    }
}
