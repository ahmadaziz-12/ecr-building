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
    // BRD §4.3.1: loyalty points accrual rate per product category (e.g. 2x on featured categories
    // during a promotional period). 1 = standard rate; read by OrdersController.Checkout.
    public decimal LoyaltyAccrualMultiplier { get; set; } = 1m;
    // BRD §3.2.3: percentage deducted from the cashback on SURPLUS returns of this category's
    // products (e.g. 5–10%). 0 = no fee. Deducted from cashback only — never from the physical
    // stock quantity reintegrated. Read by ReturnsController.
    public decimal SurplusRestockingFeePct { get; set; }
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
    // BRD §7 (CR-038): SellingPrice is the Retail list price. The three below are genuinely
    // distinct list prices for the other segments — null means "no override configured for this
    // product," so checkout falls back to SellingPrice for that segment rather than a computed
    // discount. Never derived arithmetically from SellingPrice; each is set independently by
    // whoever holds Role.CanManagePriceListAndUsers (see CatalogController).
    public decimal? ContractorPrice { get; set; }
    public decimal? WholesalePrice { get; set; }
    public decimal? ProjectPrice { get; set; }
    public decimal SellingPrice { get; set; }
    public decimal VatRate { get; set; } = 15m;
    public string StockUom { get; set; } = "Piece";
    public string SellUomsJson { get; set; } = "[]";
    public decimal Weight { get; set; }
    public bool Returnable { get; set; } = true;
    public int ReorderLevel { get; set; }
    public int ReorderQty { get; set; }
    public string? ImageUrl { get; set; }
    // BRD §2.3 items 5-6: cut-to-size products (glass, timber, cable) take dimension entry at the
    // POS instead of a plain quantity, priced at SellingPrice per stock UOM. CutToSizeUnit picks
    // which dimensions the POS asks for and how the billed qty is derived: "Length" (linear m, e.g.
    // cable cut to length), "Area" (length × width m², e.g. glass), "Volume" (length × width ×
    // height m³, e.g. sand/timber). Meaningless when IsCutToSize is false; defaults to "Area" since
    // that was this flag's only behavior before Volume/Length existed.
    public bool IsCutToSize { get; set; }
    public string CutToSizeUnit { get; set; } = "Area";
    // BRD §2.2: supplier link and physical bin/aisle reference, surfaced at the POS.
    public int? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public string? BinLocation { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<StockLevel> StockLevels { get; set; } = new List<StockLevel>();
    public ICollection<BranchStockLevel> BranchStockLevels { get; set; } = new List<BranchStockLevel>();
    public ICollection<ProductUomConversion> UomConversions { get; set; } = new List<ProductUomConversion>();
    public ICollection<ProductAttribute> Attributes { get; set; } = new List<ProductAttribute>();
}

// BRD §2.2 structured custom attributes (color code, size, grade, diameter, length, R-value,
// pressure rating…) — key-value rather than typed columns because the attribute set varies by
// category (an insulation roll has an R-value, a pipe has a pressure rating).
public class ProductAttribute
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

// BRD §2.3 (CRITICAL): one row per alternate selling UOM — "1 {Uom} = {FactorToStock} {Product.StockUom}"
// (e.g. Uom="Pallet", FactorToStock=50 on a product stocked in Bags). SellUomsJson remains a plain
// display-label list; this table is the conversion engine checkout actually computes with. A selling
// UOM with no row here is NOT sellable — checkout fails loudly rather than assuming 1:1.
public class ProductUomConversion
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string Uom { get; set; } = string.Empty;
    public decimal FactorToStock { get; set; }
}

// BRD §5.1's six commercial bundle shapes — distinguishable for reporting; the selling mechanic
// (constituent lines at a combined price) is the same for all of them.
public enum BundleType
{
    ProductSystem = 0,
    ProjectStarterPack = 1,
    QuantityPallet = 2,
    TradeValue = 3,
    CrossCategory = 4,
    Promotional = 5,
}

public class ProductBundle : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public BundleType Type { get; set; } = BundleType.ProductSystem;
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
