using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Catalog;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/catalog/categories")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class CategoriesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CategoryDto>>> List(CancellationToken ct)
    {
        var categories = await db.Categories.Include(c => c.Parent).Include(c => c.Products).OrderBy(c => c.Code).ToListAsync(ct);
        return Ok(categories.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<CategoryDto>> Create(UpsertCategoryRequest request, CancellationToken ct)
    {
        var category = new Category
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr, ParentId = request.ParentId,
            AttributesJson = JsonSerializer.Serialize(request.Attributes), ReturnRule = request.ReturnRule,
            DefaultUom = request.DefaultUom, VatRate = request.VatRate, Returnable = request.Returnable,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        if (category.ParentId is not null) await db.Entry(category).Reference(c => c.Parent).LoadAsync(ct);
        await audit.LogAsync("inventory", "CATEGORY_CREATED", category.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(category));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<CategoryDto>> Update(int id, UpsertCategoryRequest request, CancellationToken ct)
    {
        var category = await db.Categories.Include(c => c.Parent).Include(c => c.Products).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();

        category.Code = request.Code; category.NameEn = request.NameEn; category.NameAr = request.NameAr;
        category.ParentId = request.ParentId; category.AttributesJson = JsonSerializer.Serialize(request.Attributes);
        category.ReturnRule = request.ReturnRule; category.DefaultUom = request.DefaultUom;
        category.VatRate = request.VatRate; category.Returnable = request.Returnable;
        await db.SaveChangesAsync(ct);
        await db.Entry(category).Reference(c => c.Parent).LoadAsync(ct);
        await audit.LogAsync("inventory", "CATEGORY_UPDATED", category.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(category));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<CategoryDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var category = await db.Categories.Include(c => c.Parent).Include(c => c.Products).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        category.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "CATEGORY_STATUS_CHANGED", category.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(category));
    }

    private static CategoryDto Map(Category c) => new(
        c.Id, c.Code, c.NameEn, c.NameAr, c.ParentId, c.Parent?.NameEn,
        JsonSerializer.Deserialize<string[]>(c.AttributesJson) ?? [], c.ReturnRule, c.DefaultUom, c.VatRate, c.Returnable,
        c.Status.ToString(), c.Products.Count);
}

[ApiController]
[Route("api/catalog/products")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class ProductsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProductDto>>> List([FromQuery] int? branchId, CancellationToken ct)
    {
        var products = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).ThenInclude(s => s.Warehouse)
            .Include(p => p.BranchStockLevels).OrderBy(p => p.Sku).ToListAsync(ct);
        return Ok(products.Select(p => Map(p, branchId)).ToList());
    }

    [HttpGet("lookup")]
    [AllowAnonymous]
    public async Task<ActionResult<ProductDto>> Lookup([FromQuery] string barcode, CancellationToken ct)
    {
        var product = await db.Products.Include(p => p.Category).Include(p => p.StockLevels)
            .FirstOrDefaultAsync(p => p.Barcode == barcode || p.Sku == barcode, ct);
        return product is null ? NotFound() : Ok(Map(product));
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<ProductDto>> Create(UpsertProductRequest request, CancellationToken ct)
    {
        if (await db.Products.AnyAsync(p => p.Sku == request.Sku, ct))
        {
            return Conflict(new { error = "A product with this SKU already exists." });
        }

        var product = new Product
        {
            Sku = request.Sku, Barcode = request.Barcode, NameEn = request.NameEn, NameAr = request.NameAr,
            CategoryId = request.CategoryId, Brand = request.Brand, CostPrice = request.CostPrice,
            SellingPrice = request.SellingPrice, VatRate = request.VatRate, StockUom = request.StockUom,
            SellUomsJson = JsonSerializer.Serialize(request.SellUoms), Weight = request.Weight,
            Returnable = request.Returnable, ReorderLevel = request.ReorderLevel, ReorderQty = request.ReorderQty,
            ImageUrl = request.ImageUrl,
        };
        db.Products.Add(product);
        await db.SaveChangesAsync(ct);
        await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
        await audit.LogAsync("inventory", "PRODUCT_CREATED", product.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(product));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<ProductDto>> Update(int id, UpsertProductRequest request, CancellationToken ct)
    {
        var product = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        if (await db.Products.AnyAsync(p => p.Sku == request.Sku && p.Id != id, ct))
        {
            return Conflict(new { error = "A product with this SKU already exists." });
        }

        product.Sku = request.Sku; product.Barcode = request.Barcode; product.NameEn = request.NameEn; product.NameAr = request.NameAr;
        product.CategoryId = request.CategoryId; product.Brand = request.Brand; product.CostPrice = request.CostPrice;
        product.SellingPrice = request.SellingPrice; product.VatRate = request.VatRate; product.StockUom = request.StockUom;
        product.SellUomsJson = JsonSerializer.Serialize(request.SellUoms); product.Weight = request.Weight;
        product.Returnable = request.Returnable; product.ReorderLevel = request.ReorderLevel; product.ReorderQty = request.ReorderQty;
        product.ImageUrl = request.ImageUrl;
        await db.SaveChangesAsync(ct);
        await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
        await audit.LogAsync("inventory", "PRODUCT_UPDATED", product.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(product));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<ProductDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var product = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        product.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "PRODUCT_STATUS_CHANGED", product.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(product));
    }

    // branchId scopes On Hand/Available to that branch's OWN shop-floor stock (BranchStockLevel) —
    // what a cashier can actually sell right now — instead of the unscoped view, which reports
    // total bulk warehouse stock across the whole company (used by the general catalog page, not
    // by checkout/quotation cart-building).
    private static ProductDto Map(Product p, int? branchId = null)
    {
        if (branchId is not null)
        {
            var branchLevels = p.BranchStockLevels.Where(s => s.BranchId == branchId);
            return new(
                p.Id, p.Sku, p.Barcode, p.NameEn, p.NameAr, p.CategoryId, p.Category?.NameEn ?? "", p.Brand, p.CostPrice,
                p.SellingPrice, p.VatRate, p.StockUom, JsonSerializer.Deserialize<string[]>(p.SellUomsJson) ?? [], p.Weight,
                p.Returnable, p.ReorderLevel, p.ReorderQty, p.ImageUrl, p.Status.ToString(),
                branchLevels.Sum(s => s.OnHand), branchLevels.Sum(s => s.Available));
        }

        return new(
            p.Id, p.Sku, p.Barcode, p.NameEn, p.NameAr, p.CategoryId, p.Category?.NameEn ?? "", p.Brand, p.CostPrice,
            p.SellingPrice, p.VatRate, p.StockUom, JsonSerializer.Deserialize<string[]>(p.SellUomsJson) ?? [], p.Weight,
            p.Returnable, p.ReorderLevel, p.ReorderQty, p.ImageUrl, p.Status.ToString(),
            p.StockLevels.Sum(s => s.OnHand), p.StockLevels.Sum(s => s.Available));
    }
}

[ApiController]
[Route("api/catalog/bundles")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class BundlesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<BundleDto>>> List(CancellationToken ct)
    {
        var bundles = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product)
            .OrderBy(b => b.Code).ToListAsync(ct);
        return Ok(bundles.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<BundleDto>> Create(UpsertBundleRequest request, CancellationToken ct)
    {
        if (await db.ProductBundles.AnyAsync(b => b.Code == request.Code, ct))
        {
            return Conflict(new { error = "A bundle with this code already exists." });
        }
        if (request.Lines.Count == 0) return BadRequest(new { error = "A bundle needs at least one component." });

        var bundle = new ProductBundle
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr, BundlePrice = request.BundlePrice,
            Lines = request.Lines.Select(l => new BundleLine { ProductId = l.ProductId, Qty = l.Qty }).ToList(),
        };
        db.ProductBundles.Add(bundle);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BUNDLE_CREATED", bundle.Id.ToString(), newValue: request, cancellationToken: ct);

        foreach (var line in bundle.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(bundle));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<BundleDto>> Update(int id, UpsertBundleRequest request, CancellationToken ct)
    {
        var bundle = await db.ProductBundles.Include(b => b.Lines).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bundle is null) return NotFound();
        if (await db.ProductBundles.AnyAsync(b => b.Code == request.Code && b.Id != id, ct))
        {
            return Conflict(new { error = "A bundle with this code already exists." });
        }

        bundle.Code = request.Code; bundle.NameEn = request.NameEn; bundle.NameAr = request.NameAr; bundle.BundlePrice = request.BundlePrice;
        db.BundleLines.RemoveRange(bundle.Lines);
        bundle.Lines = request.Lines.Select(l => new BundleLine { BundleId = bundle.Id, ProductId = l.ProductId, Qty = l.Qty }).ToList();
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BUNDLE_UPDATED", bundle.Id.ToString(), newValue: request, cancellationToken: ct);

        foreach (var line in bundle.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(bundle));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<BundleDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var bundle = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bundle is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        bundle.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BUNDLE_STATUS_CHANGED", bundle.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(bundle));
    }

    private static BundleDto Map(ProductBundle b) => new(
        b.Id, b.Code, b.NameEn, b.NameAr, b.BundlePrice, b.Lines.Sum(l => l.Qty * (l.Product?.CostPrice ?? 0)), b.Status.ToString(),
        b.Lines.Select(l => new BundleLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.Product?.CostPrice ?? 0)).ToList());
}
