using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Category : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public int? ParentId { get; set; }
    public Category? Parent { get; set; }
    public string AttributesJson { get; set; } = "[]";
    public string ReturnRule { get; set; } = "Standard 15 days";
    public string DefaultUom { get; set; } = "Piece";
    public decimal VatRate { get; set; } = 15m;
    public bool Returnable { get; set; } = true;
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<Product> Products { get; set; } = new List<Product>();
}

public class Product : BaseEntity
{
    public string Sku { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public string? Brand { get; set; }
    public decimal CostPrice { get; set; }
    public decimal SellingPrice { get; set; }
    public decimal VatRate { get; set; } = 15m;
    public string StockUom { get; set; } = "Piece";
    public string SellUomsJson { get; set; } = "[]";
    public decimal Weight { get; set; }
    public bool Returnable { get; set; } = true;
    public int ReorderLevel { get; set; }
    public int ReorderQty { get; set; }
    public string? ImageUrl { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<StockLevel> StockLevels { get; set; } = new List<StockLevel>();
    public ICollection<BranchStockLevel> BranchStockLevels { get; set; } = new List<BranchStockLevel>();
}

public class ProductBundle : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public decimal BundlePrice { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<BundleLine> Lines { get; set; } = new List<BundleLine>();
}

public class BundleLine
{
    public int Id { get; set; }
    public int BundleId { get; set; }
    public ProductBundle? Bundle { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
}
