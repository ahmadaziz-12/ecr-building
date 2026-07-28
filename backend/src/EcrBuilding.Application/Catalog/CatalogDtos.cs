namespace EcrBuilding.Application.Catalog;

public record CategoryDto(int Id, string Code, string NameEn, string? NameAr, int? ParentId, string? ParentName, string[] Attributes, string ReturnRule, string DefaultUom, decimal VatRate, bool Returnable, decimal LoyaltyAccrualMultiplier, string Status, int SkuCount, decimal SurplusRestockingFeePct = 0);
public record UpsertCategoryRequest(string Code, string NameEn, string? NameAr, int? ParentId, string[] Attributes, string ReturnRule, string DefaultUom, decimal VatRate, bool Returnable, decimal LoyaltyAccrualMultiplier = 1m, decimal SurplusRestockingFeePct = 0);

// BRD §2.3: "1 {Uom} = {FactorToStock} {StockUom}" — the POS UOM dropdown and checkout conversion
// both read these rows; SellUoms remains display labels only.
public record ProductUomConversionDto(string Uom, decimal FactorToStock);

// BRD §2.2 structured custom attribute (color code, grade, diameter, R-value, pressure rating…).
public record ProductAttributeDto(string Name, string Value);

public record ProductDto(int Id, string Sku, string? Barcode, string NameEn, string? NameAr, int CategoryId, string CategoryName, string? Brand, decimal CostPrice, decimal SellingPrice, decimal VatRate, string StockUom, string[] SellUoms, decimal Weight, bool Returnable, int ReorderLevel, int ReorderQty, string? ImageUrl, string Status, decimal TotalOnHand, decimal TotalAvailable, IReadOnlyList<ProductUomConversionDto> UomConversions, bool IsCutToSize,
    IReadOnlyList<ProductAttributeDto>? Attributes = null, int? SupplierId = null, string? SupplierName = null, string? BinLocation = null,
    // BRD §2.3 items 5-6: which dimensions the POS asks for on a cut-to-size line — "Length" | "Area" | "Volume".
    string CutToSizeUnit = "Area",
    // BRD §7 (CR-038): distinct list prices for Contractor/Wholesale/Project — null = not configured,
    // checkout falls back to SellingPrice (the Retail price) for that segment.
    decimal? ContractorPrice = null, decimal? WholesalePrice = null, decimal? ProjectPrice = null);
public record UpsertProductRequest(string Sku, string? Barcode, string NameEn, string? NameAr, int CategoryId, string? Brand, decimal CostPrice, decimal SellingPrice, decimal VatRate, string StockUom, string[] SellUoms, decimal Weight, bool Returnable, int ReorderLevel, int ReorderQty, string? ImageUrl, List<ProductUomConversionDto>? UomConversions = null, bool IsCutToSize = false,
    List<ProductAttributeDto>? Attributes = null, int? SupplierId = null, string? BinLocation = null, string CutToSizeUnit = "Area",
    decimal? ContractorPrice = null, decimal? WholesalePrice = null, decimal? ProjectPrice = null);

public record SetStatusRequest(string Status);

// Barcode is nullable/optional (trailing) so Bundle Search (BRD §5.6) can match a scanned barcode
// against a bundle's constituents, not just its own Code/Name.
public record BundleLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitCost, decimal SellingPrice = 0, decimal VatRate = 0, string? Barcode = null);
public record BundleDto(int Id, string Code, string NameEn, string? NameAr, decimal BundlePrice, decimal ComponentCost, string Status, IReadOnlyList<BundleLineDto> Lines,
    // Module 8 (BRD §5): bundle type + what the constituents would cost individually — the POS card
    // shows "individual total vs bundle price" and the savings from these.
    string Type = "ProductSystem", decimal IndividualTotal = 0,
    // Phase 4 (BRD §5.7 Business Controls): Status above is the raw persisted lifecycle value;
    // EffectiveStatus is what a cashier/manager should actually read (Scheduled/Active/Expired
    // computed from StartDate/EndDate — see BundleLifecycle.ResolveEffectiveStatus).
    string EffectiveStatus = "Draft", DateTime? StartDate = null, DateTime? EndDate = null,
    string[]? EligibleCustomerTypes = null, int[]? EligibleBranchIds = null, bool StackableDiscount = true);
public record BundleLineInput(int ProductId, decimal Qty);
public record UpsertBundleRequest(string Code, string NameEn, string? NameAr, decimal BundlePrice, List<BundleLineInput> Lines, string Type = "ProductSystem",
    // Phase 4: create as Draft (default) or submit straight for approval; scheduling/eligibility/
    // stacking are all optional — omitted means "no restriction."
    bool Publish = false, DateTime? StartDate = null, DateTime? EndDate = null,
    string[]? EligibleCustomerTypes = null, int[]? EligibleBranchIds = null, bool StackableDiscount = true);
