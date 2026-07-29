using System.Security.Claims;
using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Application.Catalog;
using EcrBuilding.Domain.Common;
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
[RequireModule("/admin/categories", PermissionAction.View)]
public class CategoriesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CategoryDto>>> List(CancellationToken ct)
    {
        var categories = await db.Categories.Include(c => c.Parent).Include(c => c.Products).OrderBy(c => c.Code).ToListAsync(ct);
        return Ok(categories.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/admin/categories", PermissionAction.Create)]
    public async Task<ActionResult<CategoryDto>> Create(UpsertCategoryRequest request, CancellationToken ct)
    {
        var category = new Category
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr, ParentId = request.ParentId,
            Returnable = request.Returnable,
            LoyaltyAccrualMultiplier = request.LoyaltyAccrualMultiplier,
            SurplusRestockingFeePct = request.SurplusRestockingFeePct,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        if (category.ParentId is not null) await db.Entry(category).Reference(c => c.Parent).LoadAsync(ct);
        await audit.LogAsync("inventory", "CATEGORY_CREATED", category.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(category));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/admin/categories", PermissionAction.Edit)]
    public async Task<ActionResult<CategoryDto>> Update(int id, UpsertCategoryRequest request, CancellationToken ct)
    {
        var category = await db.Categories.Include(c => c.Parent).Include(c => c.Products).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();

        category.Code = request.Code; category.NameEn = request.NameEn; category.NameAr = request.NameAr;
        category.ParentId = request.ParentId; category.Returnable = request.Returnable;
        category.LoyaltyAccrualMultiplier = request.LoyaltyAccrualMultiplier;
        category.SurplusRestockingFeePct = request.SurplusRestockingFeePct;
        await db.SaveChangesAsync(ct);
        await db.Entry(category).Reference(c => c.Parent).LoadAsync(ct);
        await audit.LogAsync("inventory", "CATEGORY_UPDATED", category.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(category));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/admin/categories", PermissionAction.Delete)]
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
        c.Id, c.Code, c.NameEn, c.NameAr, c.ParentId, c.Parent?.NameEn, c.Returnable,
        c.LoyaltyAccrualMultiplier, c.Status.ToString(), c.Products.Count, c.SurplusRestockingFeePct);
}

[ApiController]
[Route("api/catalog/products")]
[Authorize]
[RequireModule("/stock/inventory", PermissionAction.View)]
public class ProductsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProductDto>>> List([FromQuery] int? branchId, CancellationToken ct)
    {
        var products = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).ThenInclude(s => s.Warehouse)
            .Include(p => p.BranchStockLevels).Include(p => p.UomConversions).Include(p => p.Attributes).Include(p => p.Supplier)
            .Include(p => p.VariantGroup)
            .OrderBy(p => p.Sku).ToListAsync(ct);
        return Ok(products.Select(p => Map(p, branchId)).ToList());
    }

    [HttpGet("lookup")]
    [AllowAnonymous]
    public async Task<ActionResult<ProductDto>> Lookup([FromQuery] string barcode, CancellationToken ct)
    {
        var product = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).Include(p => p.UomConversions)
            .Include(p => p.Attributes).Include(p => p.Supplier).Include(p => p.VariantGroup)
            .FirstOrDefaultAsync(p => p.Barcode == barcode || p.Sku == barcode, ct);
        return product is null ? NotFound() : Ok(Map(product));
    }

    [HttpPost]
    [RequireModule("/stock/inventory", PermissionAction.Create)]
    public async Task<ActionResult<ProductDto>> Create(UpsertProductRequest request, CancellationToken ct)
    {
        if (await db.Products.AnyAsync(p => p.Sku == request.Sku, ct))
        {
            return Conflict(new { error = "A product with this SKU already exists." });
        }
        // BRD §2.2: 13-digit barcodes are validated as EAN-13; shorter internal codes pass through.
        if (!Ean13.IsValidOrNotEan(request.Barcode))
        {
            return BadRequest(new { error = $"\"{request.Barcode}\" is not a valid EAN-13 barcode (checksum failed)." });
        }

        if (!CanSetPriceLists() && (request.ContractorPrice is not null || request.WholesalePrice is not null || request.ProjectPrice is not null))
        {
            return StatusCode(403, new { error = "Setting a Contractor/Wholesale/Project price requires the Manage Price List & Users permission." });
        }
        if (request.VariantGroupId is not null && !await db.ProductVariantGroups.AnyAsync(g => g.Id == request.VariantGroupId, ct))
        {
            return BadRequest(new { error = "The selected variant group does not exist." });
        }

        var product = new Product
        {
            Sku = request.Sku, Barcode = request.Barcode, NameEn = request.NameEn, NameAr = request.NameAr,
            CategoryId = request.CategoryId, Brand = request.Brand, CostPrice = request.CostPrice,
            SellingPrice = request.SellingPrice, VatRate = request.VatRate, StockUom = request.StockUom,
            SellUomsJson = JsonSerializer.Serialize(request.SellUoms), Weight = request.Weight,
            Returnable = request.Returnable, ReorderLevel = request.ReorderLevel, ReorderQty = request.ReorderQty,
            ImageUrl = request.ImageUrl, IsCutToSize = request.IsCutToSize, CutToSizeUnit = request.CutToSizeUnit,
            SupplierId = request.SupplierId, BinLocation = request.BinLocation,
            ContractorPrice = request.ContractorPrice, WholesalePrice = request.WholesalePrice, ProjectPrice = request.ProjectPrice,
            MinCutQty = request.MinCutQty, VariantGroupId = request.VariantGroupId, IsSoldByWeight = request.IsSoldByWeight,
            RequiresSerialTracking = request.RequiresSerialTracking,
        };
        product.UomConversions = BuildUomConversions(request.UomConversions, request.StockUom);
        product.Attributes = BuildAttributes(request.Attributes);
        db.Products.Add(product);
        await db.SaveChangesAsync(ct);
        await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
        if (product.SupplierId is not null) await db.Entry(product).Reference(p => p.Supplier).LoadAsync(ct);
        if (product.VariantGroupId is not null) await db.Entry(product).Reference(p => p.VariantGroup).LoadAsync(ct);
        await audit.LogAsync("inventory", "PRODUCT_CREATED", product.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(product));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/stock/inventory", PermissionAction.Edit)]
    public async Task<ActionResult<ProductDto>> Update(int id, UpsertProductRequest request, CancellationToken ct)
    {
        var product = await db.Products.Include(p => p.Category).Include(p => p.StockLevels).Include(p => p.UomConversions)
            .Include(p => p.Attributes)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        if (await db.Products.AnyAsync(p => p.Sku == request.Sku && p.Id != id, ct))
        {
            return Conflict(new { error = "A product with this SKU already exists." });
        }
        if (request.VariantGroupId is not null && !await db.ProductVariantGroups.AnyAsync(g => g.Id == request.VariantGroupId, ct))
        {
            return BadRequest(new { error = "The selected variant group does not exist." });
        }
        // Validate only when the barcode CHANGED — legacy rows may carry pre-validation values that
        // must stay editable without forcing a barcode fix first.
        if (request.Barcode != product.Barcode && !Ean13.IsValidOrNotEan(request.Barcode))
        {
            return BadRequest(new { error = $"\"{request.Barcode}\" is not a valid EAN-13 barcode (checksum failed)." });
        }
        // BRD §7 (CR-039): editing Contractor/Wholesale/Project list prices is gated separately from
        // the rest of the catalog form — a plain Inventory editor can still fix the SKU/name/stock
        // fields on a row that already carries price-list overrides without being blocked.
        if (!CanSetPriceLists() && (request.ContractorPrice != product.ContractorPrice
            || request.WholesalePrice != product.WholesalePrice || request.ProjectPrice != product.ProjectPrice))
        {
            return StatusCode(403, new { error = "Setting a Contractor/Wholesale/Project price requires the Manage Price List & Users permission." });
        }

        product.Sku = request.Sku; product.Barcode = request.Barcode; product.NameEn = request.NameEn; product.NameAr = request.NameAr;
        product.CategoryId = request.CategoryId; product.Brand = request.Brand; product.CostPrice = request.CostPrice;
        product.SellingPrice = request.SellingPrice; product.VatRate = request.VatRate; product.StockUom = request.StockUom;
        product.SellUomsJson = JsonSerializer.Serialize(request.SellUoms); product.Weight = request.Weight;
        product.Returnable = request.Returnable; product.ReorderLevel = request.ReorderLevel; product.ReorderQty = request.ReorderQty;
        product.ImageUrl = request.ImageUrl; product.IsCutToSize = request.IsCutToSize; product.CutToSizeUnit = request.CutToSizeUnit;
        product.SupplierId = request.SupplierId; product.BinLocation = request.BinLocation;
        product.ContractorPrice = request.ContractorPrice; product.WholesalePrice = request.WholesalePrice; product.ProjectPrice = request.ProjectPrice;
        product.MinCutQty = request.MinCutQty; product.VariantGroupId = request.VariantGroupId; product.IsSoldByWeight = request.IsSoldByWeight;
        product.RequiresSerialTracking = request.RequiresSerialTracking;
        // Replace-all, same pattern as RolePermissions in RolesController.Update — the request's list
        // is the complete intended state, not a delta.
        db.ProductUomConversions.RemoveRange(product.UomConversions);
        product.UomConversions = BuildUomConversions(request.UomConversions, request.StockUom);
        db.ProductAttributes.RemoveRange(product.Attributes);
        product.Attributes = BuildAttributes(request.Attributes);
        await db.SaveChangesAsync(ct);
        await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
        if (product.SupplierId is not null) await db.Entry(product).Reference(p => p.Supplier).LoadAsync(ct);
        if (product.VariantGroupId is not null) await db.Entry(product).Reference(p => p.VariantGroup).LoadAsync(ct);
        await audit.LogAsync("inventory", "PRODUCT_UPDATED", product.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(product));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/stock/inventory", PermissionAction.Delete)]
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

    // One-screen "Add Product with Variants" wizard: creates a brand-new ProductVariantGroup AND
    // every one of its variant SKUs atomically, so a non-technical admin only ever types a Value
    // (e.g. "12MM") and its price per row — the group Code and every SKU code are generated here and
    // never shown to the user. AttributeName (e.g. "Diameter") is picked once and reused as the
    // ProductAttribute.Name on every generated row.
    [HttpPost("family")]
    [RequireModule("/stock/inventory", PermissionAction.Create)]
    public async Task<ActionResult<ProductFamilyDto>> CreateFamily(CreateProductFamilyRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.NameEn)) return BadRequest(new { error = "Product name is required." });
        if (string.IsNullOrWhiteSpace(request.AttributeName))
        {
            return BadRequest(new { error = "Pick what makes each version different (e.g. Size)." });
        }
        if (request.Variants.Count == 0) return BadRequest(new { error = "Add at least one size/option." });
        var category = await db.Categories.FindAsync([request.CategoryId], ct);
        if (category is null) return BadRequest(new { error = "Unknown category." });
        foreach (var line in request.Variants)
        {
            if (string.IsNullOrWhiteSpace(line.Value)) return BadRequest(new { error = "Every row needs a value (e.g. 12MM)." });
            if (line.SellingPrice <= 0) return BadRequest(new { error = $"\"{line.Value}\" needs a selling price greater than 0." });
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var group = new ProductVariantGroup
        {
            Code = await NextAvailableGroupCodeAsync(Slugify(request.NameEn), ct),
            NameEn = request.NameEn, NameAr = request.NameAr,
            CategoryId = request.CategoryId, Category = category, ImageUrl = request.ImageUrl,
        };
        db.ProductVariantGroups.Add(group);

        var usedSkus = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var products = new List<Product>();
        foreach (var line in request.Variants)
        {
            var sku = await NextAvailableSkuAsync($"{group.Code}-{Slugify(line.Value)}", usedSkus, ct);
            usedSkus.Add(sku);
            products.Add(new Product
            {
                Sku = sku,
                NameEn = $"{request.NameEn} {line.Value}",
                NameAr = request.NameAr is null ? null : $"{request.NameAr} {line.Value}",
                CategoryId = request.CategoryId, Category = category, Brand = request.Brand,
                CostPrice = line.CostPrice, SellingPrice = line.SellingPrice, VatRate = request.VatRate,
                StockUom = request.StockUom, ImageUrl = request.ImageUrl, VariantGroup = group,
                Attributes = [new ProductAttribute { Name = request.AttributeName.Trim(), Value = line.Value.Trim() }],
            });
        }
        db.Products.AddRange(products);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("inventory", "PRODUCT_FAMILY_CREATED", group.Id.ToString(), newValue: request, cancellationToken: ct);

        var groupDto = new ProductVariantGroupDto(
            group.Id, group.Code, group.NameEn, group.NameAr, group.CategoryId, category.NameEn,
            group.ImageUrl, group.Status.ToString(), products.Count);
        return Ok(new ProductFamilyDto(groupDto, products.Select(p => Map(p)).ToList()));
    }

    private async Task<string> NextAvailableGroupCodeAsync(string baseCode, CancellationToken ct)
    {
        var code = baseCode;
        var suffix = 1;
        while (await db.ProductVariantGroups.AnyAsync(g => g.Code == code, ct))
        {
            suffix++;
            code = $"{baseCode}-{suffix}";
        }
        return code;
    }

    private async Task<string> NextAvailableSkuAsync(string baseSku, HashSet<string> alreadyUsedThisBatch, CancellationToken ct)
    {
        var sku = baseSku;
        var suffix = 1;
        while (alreadyUsedThisBatch.Contains(sku) || await db.Products.AnyAsync(p => p.Sku == sku, ct))
        {
            suffix++;
            sku = $"{baseSku}-{suffix}";
        }
        return sku;
    }

    // Turns a free-typed name/value ("Steel Rebar", "12MM") into an uppercase, hyphen-separated code
    // ("STEEL-REBAR", "12MM") — never shown to the user, just used to build a readable, unique SKU.
    private static string Slugify(string value)
    {
        var chars = value.Trim().ToUpperInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray();
        var collapsed = new string(chars);
        while (collapsed.Contains("--")) collapsed = collapsed.Replace("--", "-");
        return collapsed.Trim('-');
    }

    // BRD §7 (CR-039): "restrict manual price changes based on user permissions" — reuses the
    // existing Role.CanManagePriceListAndUsers ceiling (already issued as a JWT claim and already
    // editable on the Roles admin page; it just had no consumer before this).
    private bool CanSetPriceLists() =>
        string.Equals(User.FindFirst("posCeiling:canManagePriceListAndUsers")?.Value, "True", StringComparison.OrdinalIgnoreCase);

    private static List<ProductAttribute> BuildAttributes(List<ProductAttributeDto>? attributes) =>
        (attributes ?? [])
            .Where(a => !string.IsNullOrWhiteSpace(a.Name) && !string.IsNullOrWhiteSpace(a.Value))
            .GroupBy(a => a.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => new ProductAttribute { Name = g.Key, Value = g.First().Value.Trim() })
            .ToList();

    // Drops rows that are blank, non-positive, or duplicate the stock UOM itself (stock UOM is always
    // factor 1 by definition — storing it would just create a shadowable duplicate).
    private static List<ProductUomConversion> BuildUomConversions(List<ProductUomConversionDto>? conversions, string stockUom) =>
        (conversions ?? [])
            .Where(c => !string.IsNullOrWhiteSpace(c.Uom) && c.FactorToStock > 0
                && !c.Uom.Trim().Equals(stockUom, StringComparison.OrdinalIgnoreCase))
            .GroupBy(c => c.Uom.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => new ProductUomConversion { Uom = g.Key, FactorToStock = g.First().FactorToStock })
            .ToList();

    // branchId scopes On Hand/Available to that branch's OWN shop-floor stock (BranchStockLevel) —
    // what a cashier can actually sell right now — instead of the unscoped view, which reports
    // total bulk warehouse stock across the whole company (used by the general catalog page, not
    // by checkout/quotation cart-building). Internal (not private) so ProductVariantGroupsController
    // can map a group's variant SKUs identically to how the main product list would.
    internal static ProductDto Map(Product p, int? branchId = null)
    {
        var conversions = p.UomConversions.Select(c => new ProductUomConversionDto(c.Uom, c.FactorToStock)).ToList();
        var attributes = p.Attributes.Select(a => new ProductAttributeDto(a.Name, a.Value)).ToList();
        if (branchId is not null)
        {
            var branchLevels = p.BranchStockLevels.Where(s => s.BranchId == branchId);
            return new(
                p.Id, p.Sku, p.Barcode, p.NameEn, p.NameAr, p.CategoryId, p.Category?.NameEn ?? "", p.Brand, p.CostPrice,
                p.SellingPrice, p.VatRate, p.StockUom, JsonSerializer.Deserialize<string[]>(p.SellUomsJson) ?? [], p.Weight,
                p.Returnable, p.ReorderLevel, p.ReorderQty, p.ImageUrl, p.Status.ToString(),
                branchLevels.Sum(s => s.OnHand), branchLevels.Sum(s => s.Available), conversions, p.IsCutToSize,
                attributes, p.SupplierId, p.Supplier?.NameEn, p.BinLocation, p.CutToSizeUnit,
                p.ContractorPrice, p.WholesalePrice, p.ProjectPrice, p.MinCutQty,
                p.VariantGroupId, p.VariantGroup?.NameEn, p.IsSoldByWeight, p.RequiresSerialTracking);
        }

        return new(
            p.Id, p.Sku, p.Barcode, p.NameEn, p.NameAr, p.CategoryId, p.Category?.NameEn ?? "", p.Brand, p.CostPrice,
            p.SellingPrice, p.VatRate, p.StockUom, JsonSerializer.Deserialize<string[]>(p.SellUomsJson) ?? [], p.Weight,
            p.Returnable, p.ReorderLevel, p.ReorderQty, p.ImageUrl, p.Status.ToString(),
            p.StockLevels.Sum(s => s.OnHand), p.StockLevels.Sum(s => s.Available), conversions, p.IsCutToSize,
            attributes, p.SupplierId, p.Supplier?.NameEn, p.BinLocation, p.CutToSizeUnit,
            p.ContractorPrice, p.WholesalePrice, p.ProjectPrice, p.MinCutQty,
            p.VariantGroupId, p.VariantGroup?.NameEn, p.IsSoldByWeight, p.RequiresSerialTracking);
    }
}

[ApiController]
[Route("api/catalog/variant-groups")]
[Authorize]
[RequireModule("/stock/variant-groups", PermissionAction.View)]
public class ProductVariantGroupsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProductVariantGroupDto>>> List(CancellationToken ct)
    {
        var groups = await db.ProductVariantGroups.Include(g => g.Category).Include(g => g.Variants)
            .OrderBy(g => g.Code).ToListAsync(ct);
        return Ok(groups.Select(Map).ToList());
    }

    // Powers the POS variant picker and the admin "view siblings" flow — every Product currently
    // linked to this group, with the exact same branch-scoped stock aggregation ProductsController
    // uses everywhere else, so a variant's price/stock here always matches its own catalog row.
    [HttpGet("{id:int}/products")]
    public async Task<ActionResult<List<ProductDto>>> Products(int id, [FromQuery] int? branchId, CancellationToken ct)
    {
        if (!await db.ProductVariantGroups.AnyAsync(g => g.Id == id, ct)) return NotFound();

        var products = await db.Products.Where(p => p.VariantGroupId == id)
            .Include(p => p.Category).Include(p => p.StockLevels).ThenInclude(s => s.Warehouse)
            .Include(p => p.BranchStockLevels).Include(p => p.UomConversions).Include(p => p.Attributes)
            .Include(p => p.Supplier).Include(p => p.VariantGroup)
            .OrderBy(p => p.Sku).ToListAsync(ct);
        return Ok(products.Select(p => ProductsController.Map(p, branchId)).ToList());
    }

    [HttpPost]
    [RequireModule("/stock/variant-groups", PermissionAction.Create)]
    public async Task<ActionResult<ProductVariantGroupDto>> Create(UpsertProductVariantGroupRequest request, CancellationToken ct)
    {
        if (await db.ProductVariantGroups.AnyAsync(g => g.Code == request.Code, ct))
        {
            return Conflict(new { error = "A variant group with this code already exists." });
        }

        var group = new ProductVariantGroup
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr,
            CategoryId = request.CategoryId, ImageUrl = request.ImageUrl,
        };
        db.ProductVariantGroups.Add(group);
        await db.SaveChangesAsync(ct);
        if (group.CategoryId is not null) await db.Entry(group).Reference(g => g.Category).LoadAsync(ct);
        await audit.LogAsync("inventory", "VARIANT_GROUP_CREATED", group.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(group));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/stock/variant-groups", PermissionAction.Edit)]
    public async Task<ActionResult<ProductVariantGroupDto>> Update(int id, UpsertProductVariantGroupRequest request, CancellationToken ct)
    {
        var group = await db.ProductVariantGroups.Include(g => g.Category).Include(g => g.Variants).FirstOrDefaultAsync(g => g.Id == id, ct);
        if (group is null) return NotFound();
        if (await db.ProductVariantGroups.AnyAsync(g => g.Code == request.Code && g.Id != id, ct))
        {
            return Conflict(new { error = "A variant group with this code already exists." });
        }

        group.Code = request.Code; group.NameEn = request.NameEn; group.NameAr = request.NameAr;
        group.CategoryId = request.CategoryId; group.ImageUrl = request.ImageUrl;
        await db.SaveChangesAsync(ct);
        group.Category = group.CategoryId is not null ? await db.Categories.FirstOrDefaultAsync(c => c.Id == group.CategoryId, ct) : null;
        await audit.LogAsync("inventory", "VARIANT_GROUP_UPDATED", group.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(group));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/stock/variant-groups", PermissionAction.Delete)]
    public async Task<ActionResult<ProductVariantGroupDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var group = await db.ProductVariantGroups.Include(g => g.Category).Include(g => g.Variants).FirstOrDefaultAsync(g => g.Id == id, ct);
        if (group is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        group.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "VARIANT_GROUP_STATUS_CHANGED", group.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(group));
    }

    private static ProductVariantGroupDto Map(ProductVariantGroup g) => new(
        g.Id, g.Code, g.NameEn, g.NameAr, g.CategoryId, g.Category?.NameEn, g.ImageUrl, g.Status.ToString(), g.Variants.Count);
}

[ApiController]
[Route("api/catalog/bundles")]
[Authorize]
[RequireModule("/stock/bundles", PermissionAction.View)]
public class BundlesController(AppDbContext db, IAuditService audit, IPermissionResolver permissionResolver) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<BundleDto>>> List(CancellationToken ct)
    {
        var bundles = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product)
            .OrderBy(b => b.Code).ToListAsync(ct);
        return Ok(bundles.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/stock/bundles", PermissionAction.Create)]
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
            Type = Enum.TryParse<BundleType>(request.Type, ignoreCase: true, out var parsedType) ? parsedType : BundleType.ProductSystem,
            Lines = request.Lines.Select(l => new BundleLine { ProductId = l.ProductId, Qty = l.Qty }).ToList(),
            // Phase 4 (BRD §5.7): "Save: Draft or Publish" — Publish jumps straight into the same
            // manager sign-off queue PricingRule uses; otherwise the bundle sits editable and
            // invisible to POS/checkout until someone explicitly submits it.
            Status = request.Publish ? BundleStatus.PendingApproval : BundleStatus.Draft,
            CreatedByUserId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
            StartDate = request.StartDate, EndDate = request.EndDate, StackableDiscount = request.StackableDiscount,
            EligibleCustomerTypesJson = JsonSerializer.Serialize(request.EligibleCustomerTypes ?? []),
            EligibleBranchIdsJson = JsonSerializer.Serialize(request.EligibleBranchIds ?? []),
        };
        db.ProductBundles.Add(bundle);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BUNDLE_CREATED", bundle.Id.ToString(), newValue: request, cancellationToken: ct);

        foreach (var line in bundle.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(bundle));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/stock/bundles", PermissionAction.Edit)]
    public async Task<ActionResult<BundleDto>> Update(int id, UpsertBundleRequest request, CancellationToken ct)
    {
        var bundle = await db.ProductBundles.Include(b => b.Lines).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bundle is null) return NotFound();
        if (bundle.Status == BundleStatus.Archived) return BadRequest(new { error = "An archived bundle can't be edited." });
        if (await db.ProductBundles.AnyAsync(b => b.Code == request.Code && b.Id != id, ct))
        {
            return Conflict(new { error = "A bundle with this code already exists." });
        }

        bundle.Code = request.Code; bundle.NameEn = request.NameEn; bundle.NameAr = request.NameAr; bundle.BundlePrice = request.BundlePrice;
        if (Enum.TryParse<BundleType>(request.Type, ignoreCase: true, out var parsedType)) bundle.Type = parsedType;
        bundle.StartDate = request.StartDate; bundle.EndDate = request.EndDate; bundle.StackableDiscount = request.StackableDiscount;
        bundle.EligibleCustomerTypesJson = JsonSerializer.Serialize(request.EligibleCustomerTypes ?? []);
        bundle.EligibleBranchIdsJson = JsonSerializer.Serialize(request.EligibleBranchIds ?? []);
        // Editing a live bundle's terms re-opens the same manager sign-off it needed to go live in
        // the first place — same rule PricingRulesController.Update applies, for the same reason
        // (otherwise "Edit" is a silent side door around the approval control below).
        if (bundle.Status == BundleStatus.Active) bundle.Status = BundleStatus.PendingApproval;
        db.BundleLines.RemoveRange(bundle.Lines);
        bundle.Lines = request.Lines.Select(l => new BundleLine { BundleId = bundle.Id, ProductId = l.ProductId, Qty = l.Qty }).ToList();
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BUNDLE_UPDATED", bundle.Id.ToString(), newValue: request, cancellationToken: ct);

        foreach (var line in bundle.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(bundle));
    }

    // Phase 4 (BRD §5.7) lifecycle transitions. Draft -> PendingApproval ("submit") and
    // PendingApproval -> Draft ("send back") just need Edit; Inactive -> Active (re-enable) also
    // just needs Edit since the bundle already passed approval once. Only the FIRST go-live
    // (PendingApproval -> Active) requires the same cross-user-or-Approve-permission check
    // PricingRulesController.UpdateStatus uses — a bundle's creator can't rubber-stamp their own
    // discount into production. Archived is terminal from any state; nothing leaves it.
    [HttpPut("{id:int}/status")]
    [RequireModule("/stock/bundles", PermissionAction.Edit)]
    public async Task<ActionResult<BundleDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var bundle = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bundle is null) return NotFound();
        if (!Enum.TryParse<BundleStatus>(request.Status, out var newStatus)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });
        if (bundle.Status == BundleStatus.Archived) return BadRequest(new { error = "An archived bundle can't change status." });

        if (bundle.Status == BundleStatus.PendingApproval && newStatus == BundleStatus.Active && bundle.CreatedByUserId is not null)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var canSelfApprove = await permissionResolver.HasAsync(userId, "/stock/bundles", PermissionAction.Approve, ct);
            if (userId == bundle.CreatedByUserId && !canSelfApprove)
            {
                return BadRequest(new { error = "You cannot approve your own bundle — a different user must activate it." });
            }
        }

        bundle.Status = newStatus;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", $"BUNDLE_{bundle.Status.ToString().ToUpperInvariant()}", bundle.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(bundle));
    }

    // Phase 5 (BRD §5.5 Bundle Suggestion Engine): fire-and-forget impression logging from POS —
    // Shown when the nudge appears, Accepted/Rejected on the cashier's action. Feeds the Suggestion
    // Report (BundleReportsController.BundleSuggestions). Gated on View (not Create/Edit) since any
    // cashier who can see bundles at POS needs to be able to log an impression of one.
    public record LogSuggestionEventRequest(string EventType, int? BranchId);

    [HttpPost("{id:int}/suggestion-events")]
    public async Task<IActionResult> LogSuggestionEvent(int id, LogSuggestionEventRequest request, CancellationToken ct)
    {
        if (!await db.ProductBundles.AnyAsync(b => b.Id == id, ct)) return NotFound();
        if (!Enum.TryParse<BundleSuggestionEventType>(request.EventType, out var eventType))
        {
            return BadRequest(new { error = $"Unknown event type \"{request.EventType}\"." });
        }
        db.BundleSuggestionEvents.Add(new BundleSuggestionEvent
        {
            BundleId = id,
            EventType = eventType,
            BranchId = request.BranchId,
            UserId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        });
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static BundleDto Map(ProductBundle b) => new(
        b.Id, b.Code, b.NameEn, b.NameAr, b.BundlePrice, b.Lines.Sum(l => l.Qty * (l.Product?.CostPrice ?? 0)), b.Status.ToString(),
        b.Lines.Select(l => new BundleLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.Product?.CostPrice ?? 0, l.Product?.SellingPrice ?? 0, l.Product?.VatRate ?? 0, l.Product?.Barcode)).ToList(),
        b.Type.ToString(), b.Lines.Sum(l => l.Qty * (l.Product?.SellingPrice ?? 0)),
        BundleLifecycle.ResolveEffectiveStatus(b.Status, b.StartDate, b.EndDate, DateTime.UtcNow), b.StartDate, b.EndDate,
        JsonSerializer.Deserialize<string[]>(b.EligibleCustomerTypesJson) ?? [], JsonSerializer.Deserialize<int[]>(b.EligibleBranchIdsJson) ?? [],
        b.StackableDiscount);
}
