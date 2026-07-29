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
/// Product Variants — grouping several independent SKUs (e.g. Steel Rebar 12MM/16MM) under one
/// family for POS/catalog display, while every variant keeps its own price/stock/barcode.
/// </summary>
public class ProductVariantGroupTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private (Category Category, HttpClient Client) SeedAdminContext(AppDbContext db)
    {
        var category = TestDataSeeder.AddCategory(db, code: "STL", nameEn: "Steel");
        var role = TestDataSeeder.AddRole(db, "Admin", fullAccessModules: ModuleArea.Inventory);
        var user = TestDataSeeder.AddUser(db, role, "variant-admin@test.local");
        return (category, _factory.CreateAuthenticatedClient(user));
    }

    [Fact]
    public async Task Admin_can_create_a_variant_group_and_it_round_trips_with_zero_variants()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var response = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "STEEL-RBR-T", nameEn = "Steel Rebar", nameAr = (string?)null,
            categoryId = category.Id, imageUrl = (string?)null,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var group = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("STEEL-RBR-T", group.GetProperty("code").GetString());
        Assert.Equal("Steel Rebar", group.GetProperty("nameEn").GetString());
        Assert.Equal(category.Id, group.GetProperty("categoryId").GetInt32());
        Assert.Equal("Steel", group.GetProperty("categoryName").GetString());
        Assert.Equal(0, group.GetProperty("variantCount").GetInt32());
        Assert.Equal("Active", group.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Creating_a_group_with_a_duplicate_code_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var first = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "DUP-CODE", nameEn = "First", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "DUP-CODE", nameEn = "Second", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    private static object ProductRequest(string sku, string nameEn, int categoryId, int? variantGroupId, decimal sellingPrice = 100m) => new
    {
        sku, barcode = (string?)null, nameEn, nameAr = (string?)null, categoryId, brand = (string?)null,
        costPrice = sellingPrice * 0.7m, sellingPrice, vatRate = 15m, stockUom = "Bundle", sellUoms = Array.Empty<string>(),
        weight = 0m, returnable = true, reorderLevel = 5, reorderQty = 20, imageUrl = (string?)null,
        isCutToSize = false, variantGroupId,
        attributes = new[] { new { name = "Diameter", value = sku.EndsWith("12MM") ? "12MM" : "16MM" } },
    };

    [Fact]
    public async Task Creating_a_product_with_a_variant_group_links_it_and_returns_the_group_name()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);
        var groupResponse = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "REBAR-G1", nameEn = "Steel Rebar", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        var groupId = (await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var response = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G1-12MM", "Steel Rebar 12MM", category.Id, groupId));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var product = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(groupId, product.GetProperty("variantGroupId").GetInt32());
        Assert.Equal("Steel Rebar", product.GetProperty("variantGroupName").GetString());
    }

    [Fact]
    public async Task Creating_a_product_with_a_nonexistent_variant_group_is_rejected()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var response = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-BAD", "Steel Rebar Bad Group", category.Id, variantGroupId: 999_999));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_product_can_move_it_into_and_out_of_a_variant_group()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);
        var groupResponse = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "REBAR-G2", nameEn = "Steel Rebar", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        var groupId = (await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var create = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G2-12MM", "Steel Rebar 12MM", category.Id, variantGroupId: null));
        var productId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var linkResponse = await client.PutAsJsonAsync($"/api/catalog/products/{productId}",
            ProductRequest("STEEL-RBR-G2-12MM", "Steel Rebar 12MM", category.Id, groupId));
        Assert.Equal(HttpStatusCode.OK, linkResponse.StatusCode);
        var linked = await linkResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(groupId, linked.GetProperty("variantGroupId").GetInt32());

        var unlinkResponse = await client.PutAsJsonAsync($"/api/catalog/products/{productId}",
            ProductRequest("STEEL-RBR-G2-12MM", "Steel Rebar 12MM", category.Id, variantGroupId: null));
        Assert.Equal(HttpStatusCode.OK, unlinkResponse.StatusCode);
        var unlinked = await unlinkResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(unlinked.GetProperty("variantGroupId").ValueKind is JsonValueKind.Null);
    }

    [Fact]
    public async Task Variant_group_products_endpoint_returns_only_that_groups_siblings_with_branch_scoped_stock()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);
        var branch = TestDataSeeder.AddBranch(db);

        var groupResponse = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "REBAR-G3", nameEn = "Steel Rebar", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        var groupId = (await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var p12 = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G3-12MM", "Steel Rebar 12MM", category.Id, groupId, sellingPrice: 1950m));
        var p16 = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G3-16MM", "Steel Rebar 16MM", category.Id, groupId, sellingPrice: 2680m));
        var standalone = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G3-STANDALONE", "Unrelated Steel SKU", category.Id, variantGroupId: null));
        Assert.Equal(HttpStatusCode.OK, p12.StatusCode);
        Assert.Equal(HttpStatusCode.OK, p16.StatusCode);
        Assert.Equal(HttpStatusCode.OK, standalone.StatusCode);

        var p12Id = (await p12.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        using (var seedDb = _factory.CreateDbContext())
        {
            TestDataSeeder.AddBranchStock(seedDb, await seedDb.Products.FindAsync(p12Id) ?? throw new InvalidOperationException(), branch, 40m);
        }

        var response = await client.GetAsync($"/api/catalog/variant-groups/{groupId}/products?branchId={branch.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var products = await response.Content.ReadFromJsonAsync<JsonElement>();
        var skus = products.EnumerateArray().Select(p => p.GetProperty("sku").GetString()).ToList();

        Assert.Equal(2, products.GetArrayLength());
        Assert.Contains("STEEL-RBR-G3-12MM", skus);
        Assert.Contains("STEEL-RBR-G3-16MM", skus);
        Assert.DoesNotContain("STEEL-RBR-G3-STANDALONE", skus);

        var twelveMm = products.EnumerateArray().First(p => p.GetProperty("sku").GetString() == "STEEL-RBR-G3-12MM");
        Assert.Equal(40m, twelveMm.GetProperty("totalOnHand").GetDecimal());
    }

    [Fact]
    public async Task Setting_a_group_inactive_does_not_touch_its_variant_skus()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);
        var groupResponse = await client.PostAsJsonAsync("/api/catalog/variant-groups", new
        {
            code = "REBAR-G4", nameEn = "Steel Rebar", nameAr = (string?)null, categoryId = category.Id, imageUrl = (string?)null,
        });
        var groupId = (await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var create = await client.PostAsJsonAsync("/api/catalog/products",
            ProductRequest("STEEL-RBR-G4-12MM", "Steel Rebar 12MM", category.Id, groupId));
        var productId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var statusResponse = await client.PutAsJsonAsync($"/api/catalog/variant-groups/{groupId}/status", new { status = "Inactive" });
        Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);

        var products = await client.GetFromJsonAsync<JsonElement>("/api/catalog/products");
        var product = products.EnumerateArray().First(p => p.GetProperty("id").GetInt32() == productId);
        Assert.Equal("Active", product.GetProperty("status").GetString());
        Assert.Equal(groupId, product.GetProperty("variantGroupId").GetInt32());
    }

    private static object FamilyRequest(string nameEn, int categoryId, string attributeName, params (string Value, decimal Cost, decimal Price)[] variants) => new
    {
        nameEn, nameAr = (string?)null, categoryId, brand = (string?)null, imageUrl = (string?)null,
        stockUom = "Piece", vatRate = 15m, attributeName,
        variants = variants.Select(v => new { value = v.Value, costPrice = v.Cost, sellingPrice = v.Price }).ToArray(),
    };

    [Fact]
    public async Task One_screen_wizard_creates_the_group_and_every_variant_sku_in_one_call()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var response = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Steel Pipe", category.Id, "Diameter", ("100mm", 250m, 320m), ("150mm", 380m, 480m)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var group = body.GetProperty("group");
        Assert.Equal("Steel Pipe", group.GetProperty("nameEn").GetString());
        Assert.Equal("STEEL-PIPE", group.GetProperty("code").GetString());
        Assert.Equal(2, group.GetProperty("variantCount").GetInt32());

        var products = body.GetProperty("products").EnumerateArray().ToList();
        Assert.Equal(2, products.Count);
        var p100 = products.First(p => p.GetProperty("sku").GetString() == "STEEL-PIPE-100MM");
        Assert.Equal("Steel Pipe 100mm", p100.GetProperty("nameEn").GetString());
        Assert.Equal(320m, p100.GetProperty("sellingPrice").GetDecimal());
        Assert.Equal(250m, p100.GetProperty("costPrice").GetDecimal());
        var attrs = p100.GetProperty("attributes").EnumerateArray().ToList();
        Assert.Single(attrs);
        Assert.Equal("Diameter", attrs[0].GetProperty("name").GetString());
        Assert.Equal("100mm", attrs[0].GetProperty("value").GetString());
        Assert.Equal(group.GetProperty("id").GetInt32(), p100.GetProperty("variantGroupId").GetInt32());

        // Round-trips through the normal list endpoint exactly like any other product.
        var listed = await client.GetFromJsonAsync<JsonElement>("/api/catalog/products");
        Assert.Contains(listed.EnumerateArray(), p => p.GetProperty("sku").GetString() == "STEEL-PIPE-150MM");
    }

    [Fact]
    public async Task Wizard_auto_generates_a_unique_group_code_and_skus_when_names_collide()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var first = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Ceramic Tile", category.Id, "Size", ("600x600mm", 30m, 45m)));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Same product name again — the group Code collides ("CERAMIC-TILE") and must be disambiguated,
        // not rejected, since a non-technical user has no way to "pick a different code" themselves.
        var second = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Ceramic Tile", category.Id, "Size", ("600x600mm", 30m, 45m), ("800x800mm", 50m, 68m)));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondBody = await second.Content.ReadFromJsonAsync<JsonElement>();
        var secondGroupCode = secondBody.GetProperty("group").GetProperty("code").GetString();
        Assert.NotEqual("CERAMIC-TILE", secondGroupCode);

        // The colliding "600x600mm" value produces a colliding SKU across both families — must also
        // be disambiguated rather than a 409 the user wouldn't understand.
        var secondSkus = secondBody.GetProperty("products").EnumerateArray()
            .Select(p => p.GetProperty("sku").GetString()).ToList();
        Assert.Equal(2, secondSkus.Distinct().Count());
        Assert.DoesNotContain("CERAMIC-TILE-600X600MM", secondSkus);
    }

    [Fact]
    public async Task Wizard_rejects_an_empty_variant_list_and_a_non_positive_price()
    {
        using var db = _factory.CreateDbContext();
        var (category, client) = SeedAdminContext(db);

        var empty = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Empty Family", category.Id, "Size"));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);

        var zeroPrice = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Zero Price Family", category.Id, "Size", ("Small", 10m, 0m)));
        Assert.Equal(HttpStatusCode.BadRequest, zeroPrice.StatusCode);

        // Nothing should have been created by either rejected call.
        Assert.False(await db.ProductVariantGroups.AnyAsync(g => g.NameEn == "Empty Family" || g.NameEn == "Zero Price Family"));
    }

    [Fact]
    public async Task Wizard_rejects_an_unknown_category()
    {
        using var db = _factory.CreateDbContext();
        var (_, client) = SeedAdminContext(db);

        var response = await client.PostAsJsonAsync("/api/catalog/products/family",
            FamilyRequest("Bad Category Family", 999_999, "Size", ("A", 10m, 20m)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
