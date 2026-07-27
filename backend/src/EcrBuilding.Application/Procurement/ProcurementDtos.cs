namespace EcrBuilding.Application.Procurement;

public record SupplierDto(int Id, string Code, string NameEn, string? NameAr, string Type, string? VatNo, string? Phone, string? Email, string[] Categories, string Terms, string Currency, int LeadTimeDays, string? Iban, string Status);
public record UpsertSupplierRequest(string Code, string NameEn, string? NameAr, string Type, string? VatNo, string? Phone, string? Email, string[] Categories, string Terms, string Currency, int LeadTimeDays, string? Iban);

public record SupplierLedgerLineDto(DateTime Date, string Reference, string Description, string AccountCode, string AccountName, decimal Debit, decimal Credit);

// Uom: the purchasing unit Qty/UnitCost/ReceivedQty are expressed in ("" = the product's own StockUom).
// StockUom is included so the UI can show "3 of 5 Pallet (150 Bag)" without a second product lookup.
public record PurchaseOrderLineDto(int Id, int ProductId, string Sku, string ProductName, int BranchId, string BranchName, int? WarehouseId, string WarehouseName, string Uom, string StockUom, decimal Qty, decimal UnitCost, decimal ReceivedQty, string? BatchNo, DateTime? ExpiryDate);
public record PurchaseOrderDto(int Id, string PoNo, int SupplierId, string SupplierName, string[] Branches, string Currency, DateTime ExpectedDate, string Status, decimal Shipping, string? Incoterm, string? Carrier, string? TrackingRef, decimal TotalValue, decimal ReceivedPct, IReadOnlyList<PurchaseOrderLineDto> Lines);
public record CreatePurchaseOrderRequest(int SupplierId, string Currency, DateTime ExpectedDate, decimal Shipping, string? Incoterm, int? ApproverUserId, List<PoLineInput> Lines);
// Uom: null/"" orders in the product's own StockUom — otherwise must match a configured
// ProductUomConversion (e.g. "Pallet"), same validation the POS cart applies at checkout.
public record PoLineInput(int ProductId, int BranchId, int? WarehouseId, decimal Qty, decimal UnitCost, string? Uom, string? BatchNo, DateTime? ExpiryDate);
public record ApprovePurchaseOrderRequest(int? ApproverUserId);
public record DispatchPurchaseOrderRequest(string? Carrier, string? TrackingRef);
public record ReceivePurchaseOrderRequest(List<ReceiveLineInput> Lines);
public record ReceiveLineInput(int LineId, decimal Qty, string? BatchNo, DateTime? ExpiryDate);

public record AuditHistoryEntryDto(int Id, DateTime CreatedAt, string Event, string? UserName, string? OldValue, string? NewValue, string? Reason);

public record RtsLineDto(int ProductId, string Sku, string? BatchNo, decimal Qty, decimal UnitCost);
public record ReturnToSupplierDto(int Id, string RtsNo, int SupplierId, string SupplierName, int? PurchaseOrderId, string? PurchaseOrderNo, int BranchId, string BranchName, int WarehouseId, string WarehouseName, string Reason, DateTime Date, string? CreditNoteRef, string? Carrier, string Status, IReadOnlyList<RtsLineDto> Lines);
public record CreateRtsRequest(int SupplierId, int? PurchaseOrderId, int BranchId, int WarehouseId, string Reason, DateTime Date, string? Carrier, List<RtsLineInput> Lines);
public record RtsLineInput(int ProductId, string? BatchNo, decimal Qty, decimal UnitCost);
public record CreditRtsRequest(string CreditNoteRef);
