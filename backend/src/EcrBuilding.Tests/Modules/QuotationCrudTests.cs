using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// Quotation full-CRUD tests — Update/Delete (soft-cancel) and the manual discount override didn't
/// exist before (only Create/List/Get + the Send/Accept/Reject/Convert status transitions did).
/// </summary>
public class QuotationCrudTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private sealed record Context(AppDbContext Db, EcrBuilding.Domain.Entities.Branch Branch, EcrBuilding.Domain.Entities.Product Product, HttpClient Client);

    private Context SeedContext()
    {
        var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 15m);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos, ModuleArea.Orders]);
        var user = TestDataSeeder.AddUser(db, role, "quote-cashier@test.local", branchId: branch.Id);
        return new Context(db, branch, product, _factory.CreateAuthenticatedClient(user));
    }

    private static object CreateRequest(int branchId, int productId, decimal? discountPct = null, string projectCode = "PRJ-1", string customerReference = "REF-1", int? customerId = null) => new
    {
        branchId, customerId, lines = new[] { new { productId, qty = 2m } },
        projectCode, customerReference, discountPct,
    };

    [Fact]
    public async Task Create_accepts_a_manual_discount_override_instead_of_only_the_contractor_auto_rule()
    {
        var ctx = SeedContext();
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, discountPct: 10m));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var body = await create.Content.ReadFromJsonAsync<JsonElement>();

        // 2 × 100 = 200 gross, 10% off = 180, VAT 15% of 180 = 27.
        Assert.Equal(10m, body.GetProperty("discountPct").GetDecimal());
        Assert.Equal(20m, body.GetProperty("discountTotal").GetDecimal());
        Assert.Equal(180m, body.GetProperty("subTotal").GetDecimal() - body.GetProperty("discountTotal").GetDecimal());
        Assert.Equal(207m, body.GetProperty("grandTotal").GetDecimal());
        var line = body.GetProperty("lines")[0];
        Assert.Equal(10m, line.GetProperty("discountPct").GetDecimal());
    }

    [Fact]
    public async Task Update_while_Draft_replaces_lines_and_recomputes_totals_at_the_new_discount()
    {
        var ctx = SeedContext();
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id, discountPct: 0m));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var update = await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}", new
        {
            customerId = (int?)null,
            lines = new[] { new { productId = ctx.Product.Id, qty = 4m } },
            validUntil = (DateTime?)null,
            notes = "updated notes",
            projectCode = "PRJ-2",
            customerReference = "REF-2",
            discountPct = 20m,
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var body = await update.Content.ReadFromJsonAsync<JsonElement>();

        // 4 × 100 = 400 gross, 20% off = 320, VAT 15% of 320 = 48.
        Assert.Equal("PRJ-2", body.GetProperty("projectCode").GetString());
        Assert.Equal("REF-2", body.GetProperty("customerReference").GetString());
        Assert.Equal(20m, body.GetProperty("discountPct").GetDecimal());
        Assert.Equal(368m, body.GetProperty("grandTotal").GetDecimal());
        Assert.Single(body.GetProperty("lines").EnumerateArray());
        Assert.Equal(4m, body.GetProperty("lines")[0].GetProperty("qty").GetDecimal());
    }

    [Fact]
    public async Task Update_is_rejected_once_the_quotation_has_been_accepted()
    {
        var ctx = SeedContext();
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/accept", new { })).StatusCode);

        var update = await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}", new
        {
            customerId = (int?)null,
            lines = new[] { new { productId = ctx.Product.Id, qty = 1m } },
            validUntil = (DateTime?)null,
            notes = (string?)null,
            projectCode = "PRJ-1",
            customerReference = "REF-1",
            discountPct = 0m,
        });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        Assert.Contains("can no longer be edited", await update.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Delete_soft_cancels_a_draft_quotation_leaving_it_in_history()
    {
        var ctx = SeedContext();
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var delete = await ctx.Client.DeleteAsync($"/api/pos/quotations/{quoteId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var get = await ctx.Client.GetFromJsonAsync<JsonElement>($"/api/pos/quotations/{quoteId}");
        Assert.Equal("Cancelled", get.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Delete_is_rejected_once_the_quotation_has_been_converted_to_an_order()
    {
        var ctx = SeedContext();
        TestDataSeeder.AddBranchStock(ctx.Db, ctx.Product, ctx.Branch, 1_000m);
        var create = await ctx.Client.PostAsJsonAsync("/api/pos/quotations", CreateRequest(ctx.Branch.Id, ctx.Product.Id));
        var quoteId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PutAsJsonAsync($"/api/pos/quotations/{quoteId}/send", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ctx.Client.PostAsync($"/api/pos/quotations/{quoteId}/convert", null)).StatusCode);

        var delete = await ctx.Client.DeleteAsync($"/api/pos/quotations/{quoteId}");
        Assert.Equal(HttpStatusCode.BadRequest, delete.StatusCode);
        Assert.Contains("already converted", await delete.Content.ReadAsStringAsync());
    }
}
