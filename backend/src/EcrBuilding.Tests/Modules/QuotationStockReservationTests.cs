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
/// Stock reservation: a quotation holds (Reserved) the branch stock it quotes from creation through
/// Sent/Accepted, so a second quote/sale can't oversell the same units before this one converts or
/// is dropped. Covers Create/Update/Delete/Reject/Convert and the "never stocked here" escape hatch.
/// </summary>
public class QuotationStockReservationTests : IAsyncLifetime
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
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 15m);
        if (onHand is not null) TestDataSeeder.AddBranchStock(db, product, branch, onHand.Value);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "reserve-cashier@test.local", branchId: branch.Id);
        return new Context(db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object CreateRequest(int branchId, int productId, decimal qty, int? customerId = null) => new
    {
        branchId, customerId, lines = new[] { new { productId, qty } },
        projectCode = "PRJ-1", customerReference = "REF-1",
    };

    private async Task<BranchStockLevel> ReadStock(Context ctx) =>
        await ctx.Db.BranchStockLevels.AsNoTracking().FirstAsync(s => s.ProductId == ctx.Product.Id && s.BranchId == ctx.Branch.Id);

    [Fact]
    public async Task Create_reserves_the_quoted_qty_without_touching_OnHand()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 6m));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);

        var stock = await ReadStock(ctx);
        Assert.Equal(10m, stock.OnHand);
        Assert.Equal(6m, stock.Reserved);
    }

    [Fact]
    public async Task Create_is_rejected_once_a_prior_quotation_has_already_reserved_the_rest()
    {
        var ctx = SeedContext(onHand: 5m);
        var first = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 5m));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 1m));
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        Assert.Contains("Insufficient stock", await second.Content.ReadAsStringAsync());

        // The failed attempt must not have partially reserved anything.
        var stock = await ReadStock(ctx);
        Assert.Equal(5m, stock.Reserved);
    }

    [Fact]
    public async Task Create_succeeds_without_reserving_when_the_branch_has_never_stocked_the_product()
    {
        var ctx = SeedContext(onHand: null); // no BranchStockLevel row at all
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 6m));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);

        Assert.False(await ctx.Db.BranchStockLevels.AnyAsync(s => s.ProductId == ctx.Product.Id && s.BranchId == ctx.Branch.Id));
    }

    [Fact]
    public async Task Update_re_reserves_at_the_new_quantity()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 3m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(3m, (await ReadStock(ctx)).Reserved);

        var grow = await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}", new
        {
            customerId = (int?)null, lines = new[] { new { productId = ctx.Product.Id, qty = 7m } },
            validUntil = (DateTime?)null, notes = (string?)null, projectCode = "PRJ-1", customerReference = "REF-1", discountPct = 0m,
        });
        Assert.Equal(HttpStatusCode.OK, grow.StatusCode);
        Assert.Equal(7m, (await ReadStock(ctx)).Reserved);

        var shrink = await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}", new
        {
            customerId = (int?)null, lines = new[] { new { productId = ctx.Product.Id, qty = 2m } },
            validUntil = (DateTime?)null, notes = (string?)null, projectCode = "PRJ-1", customerReference = "REF-1", discountPct = 0m,
        });
        Assert.Equal(HttpStatusCode.OK, shrink.StatusCode);
        Assert.Equal(2m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Update_that_would_exceed_availability_is_rejected_and_leaves_the_old_reservation_intact()
    {
        var ctx = SeedContext(onHand: 5m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 3m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var update = await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}", new
        {
            customerId = (int?)null, lines = new[] { new { productId = ctx.Product.Id, qty = 6m } },
            validUntil = (DateTime?)null, notes = (string?)null, projectCode = "PRJ-1", customerReference = "REF-1", discountPct = 0m,
        });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        Assert.Equal(3m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Delete_releases_the_reservation()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(4m, (await ReadStock(ctx)).Reserved);

        Assert.Equal(HttpStatusCode.NoContent, (await ctx.Client.DeleteAsync($"/api/pos/quotations/{quoteId}")).StatusCode);
        Assert.Equal(0m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Reject_releases_the_reservation()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);
        Assert.Equal(4m, (await ReadStock(ctx)).Reserved);

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/reject", new { })).StatusCode);
        Assert.Equal(0m, (await ReadStock(ctx)).Reserved);
    }

    [Fact]
    public async Task Convert_consumes_the_reservation_into_a_real_OnHand_deduction()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PostAsync($"/api/pos/quotations/{quoteId}/convert", null)).StatusCode);

        var stock = await ReadStock(ctx);
        Assert.Equal(6m, stock.OnHand);
        Assert.Equal(0m, stock.Reserved);
    }

    [Fact]
    public async Task Convert_still_works_for_a_quotation_that_never_reserved_because_stock_arrived_later()
    {
        var ctx = SeedContext(onHand: null); // quoted before this branch had ever stocked the product
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, 4m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);

        // Stock shows up at the branch after the quote was made (e.g. a transfer landed).
        TestDataSeeder.AddBranchStock(ctx.Db, ctx.Product, ctx.Branch, 10m);

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PostAsync($"/api/pos/quotations/{quoteId}/convert", null)).StatusCode);
        var stock = await ReadStock(ctx);
        Assert.Equal(6m, stock.OnHand);
        Assert.Equal(0m, stock.Reserved);
    }

    [Fact]
    public async Task Expiring_a_stale_sent_quotation_releases_its_reservation()
    {
        var ctx = SeedContext(onHand: 10m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", new
        {
            branchId = ctx.Branch.Id, customerId = (int?)null, lines = new[] { new { productId = ctx.Product.Id, qty = 4m } },
            projectCode = "PRJ-1", customerReference = "REF-1", validUntil = DateTime.UtcNow.AddDays(-1),
        });
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);
        Assert.Equal(4m, (await ReadStock(ctx)).Reserved);

        // List triggers ExpireStale.
        var list = await ctx.Client.GetFromJsonAsync<JsonElement>("/api/pos/quotations");
        var expired = list.EnumerateArray().First(q => q.GetProperty("id").GetInt32() == quoteId);
        Assert.Equal("Expired", expired.GetProperty("status").GetString());
        Assert.Equal(0m, (await ReadStock(ctx)).Reserved);
    }
}
