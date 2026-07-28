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
/// A parked ("held") sale reserves its cart's stock too — otherwise another cashier at the same
/// branch could sell the exact items sitting in someone else's hold before the customer returns.
/// </summary>
public class ParkedSaleStockReservationTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private sealed record Context(AppDbContext Db, Branch Branch, Product Product, HttpClient Client);

    private Context SeedContext(decimal? onHand = null)
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 50m);
        if (onHand is not null) TestDataSeeder.AddBranchStock(db, product, branch, onHand.Value);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var user = TestDataSeeder.AddUser(db, role, "hold-cashier@test.local", branchId: branch.Id);
        return new Context(db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object HoldRequest(int branchId, int productId, decimal qty) => new
    {
        branchId, terminalId = (int?)null, customerId = (int?)null, notes = (string?)null,
        lines = new[] { new { productId, qty } },
    };

    private async Task<BranchStockLevel> ReadStock(Context ctx) =>
        await ctx.Db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id && s.BranchId == ctx.Branch.Id);

    [Fact]
    public async Task Holding_a_cart_reserves_its_stock()
    {
        var ctx = SeedContext(onHand: 10m);
        var hold = await ctx.Client.PostAsJsonAsync("/api/pos/parked-sales", HoldRequest(ctx.Branch.Id, ctx.Product.Id, 3m));
        Assert.Equal(HttpStatusCode.OK, hold.StatusCode);

        var stock = await ReadStock(ctx);
        Assert.Equal(10m, stock.OnHand);
        Assert.Equal(3m, stock.Reserved);
    }

    [Fact]
    public async Task Holding_a_cart_that_exceeds_whats_left_after_another_hold_is_rejected()
    {
        var ctx = SeedContext(onHand: 5m);
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PostAsJsonAsync("/api/pos/parked-sales", HoldRequest(ctx.Branch.Id, ctx.Product.Id, 5m))).StatusCode);

        var second = await ctx.Client.PostAsJsonAsync("/api/pos/parked-sales", HoldRequest(ctx.Branch.Id, ctx.Product.Id, 1m));
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        Assert.Contains("Insufficient stock", await second.Content.ReadAsStringAsync());
        Assert.Equal(5m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Deleting_a_held_ticket_releases_its_reservation()
    {
        var ctx = SeedContext(onHand: 10m);
        var hold = await ctx.Client.PostAsJsonAsync("/api/pos/parked-sales", HoldRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        var ticketId = (await hold.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(4m, (await ReadStock(ctx)).Reserved);

        Assert.Equal(HttpStatusCode.NoContent, (await ctx.Client.DeleteAsync($"/api/pos/parked-sales/{ticketId}")).StatusCode);
        Assert.Equal(0m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Holding_a_cart_for_a_product_never_stocked_at_the_branch_succeeds_without_reserving()
    {
        var ctx = SeedContext(onHand: null);
        var hold = await ctx.Client.PostAsJsonAsync("/api/pos/parked-sales", HoldRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        Assert.Equal(HttpStatusCode.OK, hold.StatusCode);
        Assert.False(await ctx.Db.BranchStockLevels.AnyAsync(s => s.ProductId == ctx.Product.Id && s.BranchId == ctx.Branch.Id));
    }
}
