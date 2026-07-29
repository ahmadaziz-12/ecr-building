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
    // BRD §3.2: category-wide return eligibility fallback — checked when a Product's OWN Returnable
    // isn't itself set false, so an admin can mark a whole category non-returnable (e.g. "Glass &
    // Windows") without touching every SKU in it. Read by FinanceController's return flows.
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

// Groups several independent Product SKUs (e.g. Steel Rebar 12MM/16MM) into one browsable family
// for POS/catalog display. Each variant SKU keeps its own price/stock/barcode/ProductAttribute
// rows exactly as a standalone product would — this is purely a display/grouping link, not a new
// pricing or stock unit, so all existing stock/movement/bundle code (keyed on Product.Id) is
// untouched. VariantGroupId is nullable: most products remain standalone.
public class ProductVariantGroup : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public string? ImageUrl { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<Product> Variants { get; set; } = new List<Product>();
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
    // BRD §2.3 enhancement: minimum billable quantity (in stock UOM) for a cut-to-size line — a
    // glass cutter still charges a minimum 0.5 m² even for a 0.2 m² cut, covering handling/setup
    // cost. Null = no minimum, billed qty is the exact measured dimension (pre-existing behavior).
    // Meaningless when IsCutToSize is false.
    public decimal? MinCutQty { get; set; }
    // BRD §2.2: supplier link and physical bin/aisle reference, surfaced at the POS.
    public int? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public string? BinLocation { get; set; }
    // Optional family link (see ProductVariantGroup) — null for standalone SKUs.
    public int? VariantGroupId { get; set; }
    public ProductVariantGroup? VariantGroup { get; set; }
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

// Phase 4 (BRD §5.7 Business Controls): Draft -> PendingApproval -> Active -> Inactive, with a
// terminal Archived reachable from any non-Active state. "Approved but not live yet" and "past its
// end date" are deliberately NOT separate persisted members — same convention as PricingRuleStatus,
// which never rewrites a row to "Expired" either: Scheduled/Active/Expired is computed at read time
// from Status == Active plus StartDate/EndDate (see BundleLifecycle.ResolveEffectiveStatus). Legacy
// data note: the two pre-Phase-4 values ("Active"/"Inactive") already parse as these exact member
// names via LegacyTolerantEnumConverter, so no EnumLegacyAliases entry or data migration is needed
// for existing rows — they simply read as already-approved/disabled bundles.
public enum BundleStatus
{
    Draft,
    PendingApproval,
    Active,
    Inactive,
    Archived,
}

public class ProductBundle : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public BundleType Type { get; set; } = BundleType.ProductSystem;
    public decimal BundlePrice { get; set; }
    public BundleStatus Status { get; set; } = BundleStatus.Draft;
    public int? CreatedByUserId { get; set; }
    // Scheduling/expiry (BRD §5.7): null = no bound on that side.
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    // Customer-group / branch eligibility (BRD §5.7): JSON int/string arrays, same convention as
    // Product.SellUomsJson — "[]" (empty array), not null, means "no restriction, everyone/every
    // branch eligible" so callers never need a separate null-check path.
    public string EligibleCustomerTypesJson { get; set; } = "[]";
    public string EligibleBranchIdsJson { get; set; } = "[]";
    // BRD §5.7 "Allow Stack Discounts": when false, an order containing this bundle gets no
    // additional coupon/manual/Trade-Value discount on top of it (OrdersController.Checkout).
    public bool StackableDiscount { get; set; } = true;

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
