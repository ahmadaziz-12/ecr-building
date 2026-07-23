namespace EcrBuilding.Application.Catalog;

public record CategoryDto(int Id, string Code, string NameEn, string? NameAr, int? ParentId, string? ParentName, string[] Attributes, string ReturnRule, string DefaultUom, decimal VatRate, bool Returnable, string Status, int SkuCount);
public record UpsertCategoryRequest(string Code, string NameEn, string? NameAr, int? ParentId, string[] Attributes, string ReturnRule, string DefaultUom, decimal VatRate, bool Returnable);

public record ProductDto(int Id, string Sku, string? Barcode, string NameEn, string? NameAr, int CategoryId, string CategoryName, string? Brand, decimal CostPrice, decimal SellingPrice, decimal VatRate, string StockUom, string[] SellUoms, decimal Weight, bool Returnable, int ReorderLevel, int ReorderQty, string? ImageUrl, string Status, decimal TotalOnHand, decimal TotalAvailable);
public record UpsertProductRequest(string Sku, string? Barcode, string NameEn, string? NameAr, int CategoryId, string? Brand, decimal CostPrice, decimal SellingPrice, decimal VatRate, string StockUom, string[] SellUoms, decimal Weight, bool Returnable, int ReorderLevel, int ReorderQty, string? ImageUrl);

public record SetStatusRequest(string Status);

public record BundleLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitCost);
public record BundleDto(int Id, string Code, string NameEn, string? NameAr, decimal BundlePrice, decimal ComponentCost, string Status, IReadOnlyList<BundleLineDto> Lines);
public record BundleLineInput(int ProductId, decimal Qty);
public record UpsertBundleRequest(string Code, string NameEn, string? NameAr, decimal BundlePrice, List<BundleLineInput> Lines);
