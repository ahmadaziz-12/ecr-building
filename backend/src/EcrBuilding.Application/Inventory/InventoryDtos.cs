namespace EcrBuilding.Application.Inventory;

public record WarehouseBinDto(int Id, string BinCode, string Label, decimal CapacityTons, decimal FilledTons);
public record WarehouseDto(
    int Id, string Code, string Name, int BranchId, string BranchName, string Type, string Status,
    IReadOnlyList<WarehouseBinDto> Bins, int ReservationCount, bool DispatchReady,
    decimal StockValue, int SkuCount, int LowStockCount, int OpenTransfersOut, int OpenTransfersIn, int ActiveBatchCount);
public record UpsertWarehouseRequest(string Code, string Name, int BranchId, string Type);
public record UpdateWarehouseRequest(string Code, string Name, int BranchId, string Type, string Status);
public record SetStatusRequest(string Status);
public record CreateWarehouseBinRequest(string BinCode, string Label, decimal CapacityTons);

public record StockLevelDto(int ProductId, string Sku, string ProductName, string CategoryName, int WarehouseId, string WarehouseName, decimal OnHand, decimal Reserved, decimal Available, int ReorderLevel, decimal Value, string Status);
public record BranchStockLevelDto(int ProductId, string Sku, string ProductName, string CategoryName, int BranchId, string BranchName, decimal OnHand, decimal Reserved, decimal Available, int ReorderLevel, decimal Value, string Status);

// WarehouseName doubles as a generic "where this batch physically sits" label — for a branch batch
// (Scope="Branch") it holds the branch's display name, not a warehouse's.
public record StockBatchDto(int Id, string Sku, string ProductName, string BatchNo, DateTime ReceivedDate, DateTime ExpiryDate, int DaysLeft, decimal Qty, string WarehouseName, string Status, string Scope = "Warehouse");
public record CreateStockBatchRequest(int ProductId, int WarehouseId, string BatchNo, DateTime ReceivedDate, DateTime ExpiryDate, decimal Qty);
public record CreateBranchStockBatchRequest(int ProductId, int BranchId, string BatchNo, DateTime ReceivedDate, DateTime ExpiryDate, decimal Qty);

public record StockTransferLineDto(
    int Id, int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitCost,
    decimal ReceivedQty, decimal Discrepancy, string? BatchNo, DateTime? ExpiryDate);
public record StockTransferDto(
    int Id, string TransferNo,
    int? FromWarehouseId, string? FromWarehouseName, int? FromBranchId, string? FromBranchName,
    int? ToWarehouseId, string? ToWarehouseName, int? ToBranchId, string? ToBranchName,
    string SourceLabel, string DestLabel,
    string Status, DateTime? Eta, string? Carrier, string? Notes, int? ApproverUserId, string? ApproverName,
    decimal TotalValue, IReadOnlyList<StockTransferLineDto> Lines);
public record CreateStockTransferRequest(
    int? FromWarehouseId, int? FromBranchId, int? ToWarehouseId, int? ToBranchId,
    DateTime? Eta, string? Carrier, string? Notes, List<TransferLineInput> Lines);
public record TransferLineInput(int ProductId, decimal Qty, decimal UnitCost, string? BatchNo, DateTime? ExpiryDate);
public record ApproveStockTransferRequest(int? ApproverUserId);
public record ReceiveStockTransferRequest(List<ReceiveTransferLineInput>? Lines);
public record ReceiveTransferLineInput(int LineId, decimal ReceivedQty);

public record StockAdjustmentLineDto(int ProductId, string Sku, decimal SystemQty, decimal CountedQty, decimal Variance, string? Note);
public record StockAdjustmentDto(int Id, string Reason, int WarehouseId, string WarehouseName, DateTime Date, string? ApproverName, bool EvidenceAttached, string Status, IReadOnlyList<StockAdjustmentLineDto> Lines);
public record CreateStockAdjustmentRequest(string Reason, int WarehouseId, DateTime Date, int? ApproverUserId, bool EvidenceAttached, List<AdjustmentLineInput> Lines);
public record AdjustmentLineInput(int ProductId, decimal SystemQty, decimal CountedQty, string? Note);

public record StockMovementDto(
    int Id, DateTime Date, string Type, int ProductId, string Sku, string ProductName,
    int BranchId, string BranchName, decimal Qty, string Direction, string? RefTable, string? RefId, string? UserName);

// ————— Automatic Stock Count (stocktake sessions) —————
// SystemQty is null on a blind count until the sheet is posted — the counter must not see what the
// system already believes, or the number they type is anchored to it.
public record StockCountLineDto(
    int Id, int ProductId, string Sku, string ProductName, string CategoryName, string Uom, string? BinLocation,
    string? Barcode, decimal? SystemQty, decimal? CountedQty, decimal? Variance, decimal? VarianceValue,
    decimal UnitCost, string? Note, DateTime? CountedAt, string Status);
public record StockCountDto(
    int Id, string CountNo, int WarehouseId, string WarehouseName, int BranchId, string BranchName,
    string Scope, int? CategoryId, string? CategoryName, string Status,
    DateTime ScheduledFor, DateTime? StartedAt, DateTime? CompletedAt,
    string? CountedByName, string? ApprovedByName, string? Notes,
    bool AutoFillUncounted, bool BlindCount, int? StockAdjustmentId,
    int LineCount, int CountedLines, int VarianceLines, decimal NetVarianceQty, decimal NetVarianceValue,
    decimal AbsVarianceValue, decimal AccuracyPct, IReadOnlyList<StockCountLineDto> Lines);
public record GenerateStockCountRequest(
    int WarehouseId, string Scope, int? CategoryId, DateTime? ScheduledFor, string? Notes,
    bool AutoFillUncounted = true, bool BlindCount = false, bool IncludeZeroStock = false, int? TopN = null);
public record SaveStockCountLinesRequest(List<StockCountLineInput> Lines);
public record StockCountLineInput(int LineId, decimal? CountedQty, string? Note);
public record ScanStockCountRequest(string Code, decimal Qty = 1, bool Increment = true);
public record PostStockCountRequest(int? ApproverUserId, string? Notes);
