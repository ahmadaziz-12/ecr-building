using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Inventory;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/inventory/warehouses")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class WarehousesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<WarehouseDto>>> List(CancellationToken ct)
    {
        var warehouses = await db.Warehouses.Include(w => w.Branch).Include(w => w.Bins).OrderBy(w => w.Code).ToListAsync(ct);

        var levels = await db.StockLevels.Include(s => s.Product).ToListAsync(ct);
        var levelsByWarehouse = levels.GroupBy(s => s.WarehouseId).ToDictionary(g => g.Key, g => g.ToList());
        var reservationCounts = levelsByWarehouse.ToDictionary(g => g.Key, g => g.Value.Count(s => s.Reserved > 0));

        var transfers = await db.StockTransfers
            .Where(t => t.Status != StockTransferStatus.Received && t.Status != StockTransferStatus.Cancelled)
            .Select(t => new { t.FromWarehouseId, t.ToWarehouseId }).ToListAsync(ct);
        // A branch-to-branch transfer leaves FromWarehouseId/ToWarehouseId null — Dictionary<int, _>
        // can't key on that, and these per-warehouse counters don't apply to it anyway.
        var transfersOut = transfers.Where(t => t.FromWarehouseId is not null)
            .GroupBy(t => t.FromWarehouseId!.Value).ToDictionary(g => g.Key, g => g.Count());
        var transfersIn = transfers.Where(t => t.ToWarehouseId is not null)
            .GroupBy(t => t.ToWarehouseId!.Value).ToDictionary(g => g.Key, g => g.Count());

        var now = DateTime.UtcNow;
        var activeBatchCounts = await db.StockBatches.Where(b => b.ManualStatus != StockBatchStatus.WrittenOff && b.ExpiryDate >= now)
            .GroupBy(b => b.WarehouseId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return Ok(warehouses.Select(w =>
        {
            var wLevels = levelsByWarehouse.GetValueOrDefault(w.Id, []);
            var stockValue = wLevels.Sum(s => s.OnHand * (s.Product?.CostPrice ?? 0));
            var lowStockCount = wLevels.Count(s => s.Available <= 0 || s.Available <= (s.Product?.ReorderLevel ?? 0));
            return Map(w, reservationCounts.GetValueOrDefault(w.Id), stockValue, wLevels.Count, lowStockCount,
                transfersOut.GetValueOrDefault(w.Id), transfersIn.GetValueOrDefault(w.Id), activeBatchCounts.GetValueOrDefault(w.Id));
        }).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<WarehouseDto>> Create(UpsertWarehouseRequest request, CancellationToken ct)
    {
        var warehouse = new Warehouse
        {
            Code = request.Code, Name = request.Name, BranchId = request.BranchId,
            Type = Enum.Parse<WarehouseType>(request.Type),
        };
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync(ct);
        await db.Entry(warehouse).Reference(w => w.Branch).LoadAsync(ct);
        await audit.LogAsync("inventory", "WAREHOUSE_CREATED", warehouse.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(warehouse, 0, 0, 0, 0, 0, 0, 0));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<WarehouseDto>> Update(int id, UpdateWarehouseRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.Include(w => w.Branch).Include(w => w.Bins).FirstOrDefaultAsync(w => w.Id == id, ct);
        if (warehouse is null) return NotFound();
        if (!Enum.TryParse<WarehouseType>(request.Type, out var type)) return BadRequest(new { error = $"Unknown warehouse type \"{request.Type}\"." });
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        var old = Map(warehouse, 0, 0, 0, 0, 0, 0, 0);
        warehouse.Code = request.Code;
        warehouse.Name = request.Name;
        warehouse.BranchId = request.BranchId;
        warehouse.Type = type;
        warehouse.Status = status;
        await db.SaveChangesAsync(ct);
        await db.Entry(warehouse).Reference(w => w.Branch).LoadAsync(ct);

        var updated = Map(warehouse, 0, 0, 0, 0, 0, 0, 0);
        await audit.LogAsync("inventory", "WAREHOUSE_UPDATED", id.ToString(), oldValue: old, newValue: updated, cancellationToken: ct);
        return Ok(updated);
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<WarehouseDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.Include(w => w.Branch).Include(w => w.Bins).FirstOrDefaultAsync(w => w.Id == id, ct);
        if (warehouse is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        warehouse.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "WAREHOUSE_STATUS_CHANGED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(warehouse, 0, 0, 0, 0, 0, 0, 0));
    }

    [HttpPost("{id:int}/bins")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<WarehouseDto>> CreateBin(int id, CreateWarehouseBinRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.Include(w => w.Branch).Include(w => w.Bins).FirstOrDefaultAsync(w => w.Id == id, ct);
        if (warehouse is null) return NotFound();

        var bin = new WarehouseBin { WarehouseId = id, BinCode = request.BinCode, Label = request.Label, CapacityTons = request.CapacityTons };
        db.WarehouseBins.Add(bin);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "WAREHOUSE_BIN_CREATED", id.ToString(), newValue: request, cancellationToken: ct);

        warehouse.Bins.Add(bin);
        return Ok(Map(warehouse, 0, 0, 0, 0, 0, 0, 0));
    }

    [HttpDelete("{id:int}/bins/{binId:int}")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<WarehouseDto>> DeleteBin(int id, int binId, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.Include(w => w.Branch).Include(w => w.Bins).FirstOrDefaultAsync(w => w.Id == id, ct);
        if (warehouse is null) return NotFound();
        var bin = warehouse.Bins.FirstOrDefault(b => b.Id == binId);
        if (bin is null) return NotFound();

        db.WarehouseBins.Remove(bin);
        warehouse.Bins.Remove(bin);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "WAREHOUSE_BIN_DELETED", id.ToString(), cancellationToken: ct);
        return Ok(Map(warehouse, 0, 0, 0, 0, 0, 0, 0));
    }

    private static WarehouseDto Map(Warehouse w, int reservationCount, decimal stockValue, int skuCount, int lowStockCount,
        int openTransfersOut, int openTransfersIn, int activeBatchCount) => new(
        w.Id, w.Code, w.Name, w.BranchId, w.Branch?.NameEn ?? "", w.Type.ToString(), w.Status.ToString(),
        w.Bins.Select(b => new WarehouseBinDto(b.Id, b.BinCode, b.Label, b.CapacityTons, b.FilledTons)).ToList(),
        reservationCount, reservationCount == 0,
        stockValue, skuCount, lowStockCount, openTransfersOut, openTransfersIn, activeBatchCount);
}

[ApiController]
[Route("api/inventory/stock-levels")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockLevelsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<StockLevelDto>>> List(CancellationToken ct)
    {
        var levels = await db.StockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
            .Include(s => s.Warehouse).OrderBy(s => s.Product!.Sku).ToListAsync(ct);

        return Ok(levels.Select(s =>
        {
            var status = s.Available <= 0 ? "Critical" : s.Available <= s.Product!.ReorderLevel ? "Low" : "Healthy";
            return new StockLevelDto(
                s.ProductId, s.Product!.Sku, s.Product.NameEn, s.Product.Category?.NameEn ?? "", s.WarehouseId,
                s.Warehouse?.Name ?? "", s.OnHand, s.Reserved, s.Available, s.Product.ReorderLevel,
                s.OnHand * s.Product.CostPrice, status);
        }).ToList());
    }
}

[ApiController]
[Route("api/inventory/branch-stock-levels")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class BranchStockLevelsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<BranchStockLevelDto>>> List(CancellationToken ct)
    {
        var levels = await db.BranchStockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
            .Include(s => s.Branch).OrderBy(s => s.Product!.Sku).ToListAsync(ct);

        return Ok(levels.Select(s =>
        {
            var status = s.Available <= 0 ? "Critical" : s.Available <= s.Product!.ReorderLevel ? "Low" : "Healthy";
            return new BranchStockLevelDto(
                s.ProductId, s.Product!.Sku, s.Product.NameEn, s.Product.Category?.NameEn ?? "", s.BranchId,
                s.Branch?.NameEn ?? "", s.OnHand, s.Reserved, s.Available, s.Product.ReorderLevel,
                s.OnHand * s.Product.CostPrice, status);
        }).ToList());
    }
}

[ApiController]
[Route("api/inventory/stock-batches")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockBatchesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<StockBatchDto>>> List(CancellationToken ct)
    {
        var batches = await db.StockBatches.Include(b => b.Product).Include(b => b.Warehouse)
            .OrderBy(b => b.ExpiryDate).ToListAsync(ct);
        return Ok(batches.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockBatchDto>> Create(CreateStockBatchRequest request, CancellationToken ct)
    {
        var batch = new StockBatch
        {
            ProductId = request.ProductId, WarehouseId = request.WarehouseId, BatchNo = request.BatchNo,
            ReceivedDate = request.ReceivedDate, ExpiryDate = request.ExpiryDate, Qty = request.Qty,
        };
        db.StockBatches.Add(batch);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BATCH_CREATED", batch.Id.ToString(), newValue: request, cancellationToken: ct);

        await db.Entry(batch).Reference(b => b.Product).LoadAsync(ct);
        await db.Entry(batch).Reference(b => b.Warehouse).LoadAsync(ct);
        return Ok(Map(batch));
    }

    [HttpPut("{id:int}/quarantine")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public Task<ActionResult<StockBatchDto>> Quarantine(int id, CancellationToken ct) => SetManualStatus(id, StockBatchStatus.Quarantine, "BATCH_QUARANTINED", ct);

    [HttpPut("{id:int}/write-off")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public Task<ActionResult<StockBatchDto>> WriteOff(int id, CancellationToken ct) => SetManualStatus(id, StockBatchStatus.WrittenOff, "BATCH_WRITTEN_OFF", ct);

    [HttpPut("{id:int}/move-to-promo")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockBatchDto>> MoveToPromo(int id, CancellationToken ct)
    {
        var batch = await db.StockBatches.Include(b => b.Product).Include(b => b.Warehouse).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (batch is null) return NotFound();

        batch.OnPromo = true;
        batch.ManualStatus = null; // promo clears any prior manual override so the computed expiry status still shows
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "BATCH_MOVED_TO_PROMO", batch.Id.ToString(), cancellationToken: ct);
        return Ok(Map(batch));
    }

    private async Task<ActionResult<StockBatchDto>> SetManualStatus(int id, StockBatchStatus status, string auditAction, CancellationToken ct)
    {
        var batch = await db.StockBatches.Include(b => b.Product).Include(b => b.Warehouse).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (batch is null) return NotFound();

        batch.ManualStatus = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", auditAction, batch.Id.ToString(), cancellationToken: ct);
        return Ok(Map(batch));
    }

    private static StockBatchDto Map(StockBatch b)
    {
        var daysLeft = (int)(b.ExpiryDate.Date - DateTime.UtcNow.Date).TotalDays;
        var computed = daysLeft < 0 ? "Expired" : daysLeft <= 7 ? "Critical" : daysLeft <= 30 ? "Expiring" : daysLeft <= 90 ? "Monitor" : "Healthy";
        var status = b.ManualStatus?.ToString() ?? (b.OnPromo ? "On Promo" : computed);
        return new StockBatchDto(b.Id, b.Product!.Sku, b.Product.NameEn, b.BatchNo, b.ReceivedDate, b.ExpiryDate, daysLeft, b.Qty, b.Warehouse?.Name ?? "", status);
    }
}

[ApiController]
[Route("api/inventory/transfers")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockTransfersController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements) : ControllerBase
{
    private IQueryable<StockTransfer> WithIncludes() => db.StockTransfers
        .Include(t => t.FromWarehouse).Include(t => t.ToWarehouse).Include(t => t.FromBranch).Include(t => t.ToBranch)
        .Include(t => t.Lines).ThenInclude(l => l.Product);

    // A transfer's source/destination is EITHER a warehouse OR a branch — these three helpers hide
    // which one behind a single call so Create/Dispatch/Receive/Cancel don't need to branch on it
    // themselves. Used both at Create (fail fast on an impossible draft) and at Dispatch (stock may
    // have moved between Create and Dispatch, so it's re-checked, not just trusted from Create).
    private async Task<string?> ValidateDebitAsync(int? warehouseId, int? branchId, int productId, decimal qty, string? batchNo, string? productName, CancellationToken ct)
    {
        if (warehouseId is not null)
        {
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == productId && s.WarehouseId == warehouseId, ct);
            if (level is null || level.Available < qty)
            {
                return $"Insufficient available stock for \"{productName}\" at the source warehouse (available: {level?.Available ?? 0}, requested: {qty}).";
            }
            if (!string.IsNullOrWhiteSpace(batchNo))
            {
                var batch = await db.StockBatches.FirstOrDefaultAsync(b => b.ProductId == productId && b.WarehouseId == warehouseId && b.BatchNo == batchNo, ct);
                if (batch is null || batch.Qty < qty)
                {
                    return $"Batch \"{batchNo}\" doesn't have enough quantity for \"{productName}\" (available: {batch?.Qty ?? 0}, requested: {qty}).";
                }
            }
            return null;
        }
        var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == productId && s.BranchId == branchId, ct);
        return branchLevel is null || branchLevel.Available < qty
            ? $"Insufficient available stock for \"{productName}\" at the source branch (available: {branchLevel?.Available ?? 0}, requested: {qty})."
            : null;
    }

    private async Task DebitAsync(int? warehouseId, int? branchId, int productId, decimal qty, string? batchNo, string? refId, CancellationToken ct)
    {
        if (warehouseId is not null)
        {
            var level = await db.StockLevels.FirstAsync(s => s.ProductId == productId && s.WarehouseId == warehouseId, ct);
            level.OnHand -= qty;
            if (!string.IsNullOrWhiteSpace(batchNo))
            {
                var batch = await db.StockBatches.FirstAsync(b => b.ProductId == productId && b.WarehouseId == warehouseId && b.BatchNo == batchNo, ct);
                batch.Qty -= qty;
            }
            return;
        }
        var branchLevel = await db.BranchStockLevels.FirstAsync(s => s.ProductId == productId && s.BranchId == branchId, ct);
        branchLevel.OnHand -= qty;
        await stockMovements.RecordAsync(productId, branchId!.Value, StockMovementType.TransferOut, -qty,
            refTable: "StockTransfer", refId: refId, cancellationToken: ct);
    }

    // Also used to restore a Cancel-while-InTransit — "give it back to the source" is the same
    // operation as "credit this location", find-or-create included.
    private async Task CreditAsync(int? warehouseId, int? branchId, int productId, decimal qty, string? batchNo, DateTime? expiryDate, string? refId, CancellationToken ct)
    {
        if (warehouseId is not null)
        {
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == productId && s.WarehouseId == warehouseId, ct);
            if (level is null)
            {
                level = new StockLevel { ProductId = productId, WarehouseId = warehouseId.Value };
                db.StockLevels.Add(level);
            }
            level.OnHand += qty;

            if (!string.IsNullOrWhiteSpace(batchNo) && qty > 0)
            {
                var batch = await db.StockBatches.FirstOrDefaultAsync(b => b.ProductId == productId && b.WarehouseId == warehouseId && b.BatchNo == batchNo, ct);
                if (batch is null)
                {
                    batch = new StockBatch
                    {
                        ProductId = productId, WarehouseId = warehouseId.Value, BatchNo = batchNo,
                        ReceivedDate = DateTime.UtcNow, ExpiryDate = expiryDate ?? DateTime.UtcNow.AddYears(1),
                    };
                    db.StockBatches.Add(batch);
                }
                batch.Qty += qty;
            }
            return;
        }
        var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == productId && s.BranchId == branchId, ct);
        if (branchLevel is null)
        {
            branchLevel = new BranchStockLevel { ProductId = productId, BranchId = branchId!.Value };
            db.BranchStockLevels.Add(branchLevel);
        }
        branchLevel.OnHand += qty; // branches don't batch-track — no destination StockBatch here
        await stockMovements.RecordAsync(productId, branchId!.Value, StockMovementType.TransferIn, qty,
            refTable: "StockTransfer", refId: refId, cancellationToken: ct);
    }

    [HttpGet]
    public async Task<ActionResult<List<StockTransferDto>>> List(CancellationToken ct)
    {
        var transfers = await WithIncludes().OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        var approverIds = transfers.Where(t => t.ApproverUserId != null).Select(t => t.ApproverUserId!.Value).Distinct().ToList();
        var approvers = await db.Users.Where(u => approverIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(transfers.Select(t => Map(t, approvers)).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Create(CreateStockTransferRequest request, CancellationToken ct)
    {
        if ((request.FromWarehouseId is null) == (request.FromBranchId is null))
        {
            return BadRequest(new { error = "Pick exactly one source — a warehouse or a branch." });
        }
        if ((request.ToWarehouseId is null) == (request.ToBranchId is null))
        {
            return BadRequest(new { error = "Pick exactly one destination — a warehouse or a branch." });
        }
        if (request.FromWarehouseId is not null && request.FromWarehouseId == request.ToWarehouseId)
        {
            return BadRequest(new { error = "Source and destination warehouse must differ." });
        }
        if (request.FromBranchId is not null && request.FromBranchId == request.ToBranchId)
        {
            return BadRequest(new { error = "Source and destination branch must differ." });
        }

        if (request.Lines.Count == 0)
        {
            return BadRequest(new { error = "At least one line item is required." });
        }

        // Fail fast on a draft that could never be fulfilled, rather than letting it sit through
        // approval and only discovering the shortfall at Dispatch. Re-checked at Dispatch too,
        // since stock can move between Create and Dispatch (other sales, other transfers).
        var productNames = await db.Products.Where(p => request.Lines.Select(l => l.ProductId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.NameEn, ct);
        foreach (var line in request.Lines)
        {
            var productName = productNames.GetValueOrDefault(line.ProductId, $"product #{line.ProductId}");
            var error = await ValidateDebitAsync(request.FromWarehouseId, request.FromBranchId, line.ProductId, line.Qty, line.BatchNo, productName, ct);
            if (error is not null) return BadRequest(new { error });
        }

        var transferNo = $"TRF-{DateTime.UtcNow:yyyy}-{await db.StockTransfers.CountAsync(ct) + 1:D4}";
        var transfer = new StockTransfer
        {
            TransferNo = transferNo,
            FromWarehouseId = request.FromWarehouseId, FromBranchId = request.FromBranchId,
            ToWarehouseId = request.ToWarehouseId, ToBranchId = request.ToBranchId,
            Eta = request.Eta, Carrier = request.Carrier, Notes = request.Notes,
            Lines = request.Lines.Select(l => new StockTransferLine
            {
                ProductId = l.ProductId, Qty = l.Qty, UnitCost = l.UnitCost, BatchNo = l.BatchNo, ExpiryDate = l.ExpiryDate,
            }).ToList(),
        };
        db.StockTransfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_CREATED", transfer.Id.ToString(), newValue: request, cancellationToken: ct);

        var created = await WithIncludes().FirstAsync(t => t.Id == transfer.Id, ct);
        return Ok(Map(created, []));
    }

    [HttpPut("{id:int}/submit")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public Task<ActionResult<StockTransferDto>> Submit(int id, CancellationToken ct) =>
        Transition(id, StockTransferStatus.Draft, StockTransferStatus.PendingApproval, "TRANSFER_SUBMITTED", null, ct);

    [HttpPut("{id:int}/approve")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public Task<ActionResult<StockTransferDto>> Approve(int id, ApproveStockTransferRequest request, CancellationToken ct) =>
        Transition(id, StockTransferStatus.PendingApproval, StockTransferStatus.Approved, "TRANSFER_APPROVED",
            t => t.ApproverUserId = request.ApproverUserId ?? t.ApproverUserId, ct);

    private async Task<ActionResult<StockTransferDto>> Transition(int id, StockTransferStatus from, StockTransferStatus to, string auditEvent, Action<StockTransfer>? apply, CancellationToken ct)
    {
        var transfer = await WithIncludes().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status != from) return BadRequest(new { error = $"Transfer must be {from} to perform this action (currently {transfer.Status})." });

        apply?.Invoke(transfer);
        transfer.Status = to;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", auditEvent, transfer.Id.ToString(), cancellationToken: ct);
        return Ok(Map(transfer, []));
    }

    [HttpPut("{id:int}/dispatch")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Dispatch(int id, CancellationToken ct)
    {
        var transfer = await WithIncludes().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status != StockTransferStatus.Approved) return BadRequest(new { error = "Only approved transfers can be dispatched." });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in transfer.Lines)
        {
            var error = await ValidateDebitAsync(transfer.FromWarehouseId, transfer.FromBranchId, line.ProductId, line.Qty, line.BatchNo, line.Product?.NameEn, ct);
            if (error is not null) return BadRequest(new { error });
        }

        // Two-phase stock movement: leave the source now (truck loaded), arrive at destination only
        // on Receive. Deducting only at Receive (the old behavior) left source stock double-allocatable
        // for the entire time a shipment was "in transit".
        foreach (var line in transfer.Lines)
        {
            await DebitAsync(transfer.FromWarehouseId, transfer.FromBranchId, line.ProductId, line.Qty, line.BatchNo, transfer.Id.ToString(), ct);
        }

        transfer.Status = StockTransferStatus.InTransit;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_DISPATCHED", transfer.Id.ToString(), cancellationToken: ct);
        return Ok(Map(transfer, []));
    }

    [HttpPut("{id:int}/receive")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Receive(int id, ReceiveStockTransferRequest? request, CancellationToken ct)
    {
        var transfer = await WithIncludes().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status != StockTransferStatus.InTransit) return BadRequest(new { error = "Only an in-transit transfer can be received." });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in transfer.Lines)
        {
            var receivedQty = request?.Lines?.FirstOrDefault(l => l.LineId == line.Id)?.ReceivedQty ?? line.Qty;
            line.ReceivedQty = receivedQty;
            await CreditAsync(transfer.ToWarehouseId, transfer.ToBranchId, line.ProductId, receivedQty, line.BatchNo, line.ExpiryDate, transfer.Id.ToString(), ct);
        }

        transfer.Status = StockTransferStatus.Received;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_RECEIVED", transfer.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(transfer, []));
    }

    [HttpPut("{id:int}/cancel")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Cancel(int id, CancellationToken ct)
    {
        var transfer = await WithIncludes().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status is not (StockTransferStatus.Draft or StockTransferStatus.PendingApproval
            or StockTransferStatus.Approved or StockTransferStatus.InTransit))
        {
            return BadRequest(new { error = "Only a Draft, Pending Approval, Approved, or In Transit transfer can be cancelled." });
        }

        if (transfer.Status == StockTransferStatus.InTransit)
        {
            // Stock left the source at Dispatch and nothing has arrived yet (Receive is single-shot
            // and terminal) — recalling the shipment means giving it all back to the source.
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            foreach (var line in transfer.Lines)
            {
                await CreditAsync(transfer.FromWarehouseId, transfer.FromBranchId, line.ProductId, line.Qty, line.BatchNo, line.ExpiryDate, transfer.Id.ToString(), ct);
            }
            transfer.Status = StockTransferStatus.Cancelled;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        else
        {
            transfer.Status = StockTransferStatus.Cancelled;
            await db.SaveChangesAsync(ct);
        }

        await audit.LogAsync("inventory", "TRANSFER_CANCELLED", transfer.Id.ToString(), cancellationToken: ct);
        return Ok(Map(transfer, []));
    }

    private static StockTransferDto Map(StockTransfer t, Dictionary<int, string> approvers) => new(
        t.Id, t.TransferNo,
        t.FromWarehouseId, t.FromWarehouse?.Name, t.FromBranchId, t.FromBranch?.NameEn,
        t.ToWarehouseId, t.ToWarehouse?.Name, t.ToBranchId, t.ToBranch?.NameEn,
        t.FromWarehouse?.Name ?? (t.FromBranch is not null ? $"{t.FromBranch.NameEn} (Branch)" : ""),
        t.ToWarehouse?.Name ?? (t.ToBranch is not null ? $"{t.ToBranch.NameEn} (Branch)" : ""),
        t.Status.ToString(), t.Eta, t.Carrier, t.Notes, t.ApproverUserId,
        t.ApproverUserId is not null && approvers.TryGetValue(t.ApproverUserId.Value, out var n) ? n : null,
        t.Lines.Sum(l => l.Qty * l.UnitCost),
        t.Lines.Select(l => new StockTransferLineDto(
            l.Id, l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.UnitCost,
            l.ReceivedQty, l.Qty - l.ReceivedQty, l.BatchNo, l.ExpiryDate)).ToList());
}

[ApiController]
[Route("api/inventory/adjustments")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockAdjustmentsController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<StockAdjustmentDto>>> List(CancellationToken ct)
    {
        var adjustments = await db.StockAdjustments.Include(a => a.Warehouse).Include(a => a.Lines).ThenInclude(l => l.Product)
            .OrderByDescending(a => a.Date).ToListAsync(ct);
        var approverIds = adjustments.Where(a => a.ApproverUserId != null).Select(a => a.ApproverUserId!.Value).Distinct().ToList();
        var approvers = await db.Users.Where(u => approverIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(adjustments.Select(a => Map(a, approvers)).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockAdjustmentDto>> Create(CreateStockAdjustmentRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.FindAsync([request.WarehouseId], ct);
        if (warehouse is null) return BadRequest(new { error = "Unknown warehouse." });

        var adjustment = new StockAdjustment
        {
            Reason = request.Reason, WarehouseId = request.WarehouseId, Date = request.Date,
            ApproverUserId = request.ApproverUserId, EvidenceAttached = request.EvidenceAttached,
            Lines = request.Lines.Select(l => new StockAdjustmentLine
            {
                ProductId = l.ProductId, SystemQty = l.SystemQty, CountedQty = l.CountedQty, Note = l.Note,
            }).ToList(),
        };
        db.StockAdjustments.Add(adjustment);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in adjustment.Lines)
        {
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == request.WarehouseId, ct);
            if (level is null)
            {
                level = new StockLevel { ProductId = line.ProductId, WarehouseId = request.WarehouseId };
                db.StockLevels.Add(level);
            }
            level.OnHand = line.CountedQty;

            // A stocktake correction is the same class of movement as a PO receipt or an RTS dispatch
            // — it must land on the branch's sellable pool too, or a cycle count that finds shrinkage
            // (or extra stock) never reaches what the POS actually sells from. Same single-warehouse-
            // per-branch invariant the receive/RTS fixes established: both pools track one physical
            // stock, so a stocktake sets both to the same counted absolute value.
            var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == warehouse.BranchId, ct);
            if (branchLevel is null)
            {
                branchLevel = new BranchStockLevel { ProductId = line.ProductId, BranchId = warehouse.BranchId };
                db.BranchStockLevels.Add(branchLevel);
            }
            branchLevel.OnHand = line.CountedQty;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("inventory", "STOCK_ADJUSTMENT_APPLIED", adjustment.Id.ToString(), newValue: request, cancellationToken: ct);
        foreach (var line in adjustment.Lines)
        {
            var variance = line.CountedQty - line.SystemQty;
            if (variance == 0) continue;
            await stockMovements.RecordAsync(line.ProductId, warehouse.BranchId, StockMovementType.Adjustment, variance,
                refTable: "StockAdjustment", refId: adjustment.Id.ToString(), cancellationToken: ct);
        }
        await db.Entry(adjustment).Reference(a => a.Warehouse).LoadAsync(ct);
        foreach (var line in adjustment.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        var approverName = adjustment.ApproverUserId is null ? null : (await db.Users.FindAsync([adjustment.ApproverUserId], ct))?.Name;
        return Ok(Map(adjustment, adjustment.ApproverUserId is null ? [] : new Dictionary<int, string> { [adjustment.ApproverUserId.Value] = approverName ?? "" }));
    }

    private static StockAdjustmentDto Map(StockAdjustment a, Dictionary<int, string> approvers) => new(
        a.Id, a.Reason, a.WarehouseId, a.Warehouse?.Name ?? "", a.Date,
        a.ApproverUserId is not null && approvers.TryGetValue(a.ApproverUserId.Value, out var n) ? n : null,
        a.EvidenceAttached, a.Status.ToString(),
        a.Lines.Select(l => new StockAdjustmentLineDto(l.ProductId, l.Product?.Sku ?? "", l.SystemQty, l.CountedQty, l.Variance, l.Note)).ToList());
}

[ApiController]
[Route("api/inventory/stock-movements")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockMovementsController(AppDbContext db) : ControllerBase
{
    private static readonly Dictionary<StockMovementType, string> TypeLabels = new()
    {
        [StockMovementType.Sale] = "Sale",
        [StockMovementType.Void] = "Void",
        [StockMovementType.ReturnRestock] = "Return (Restock)",
        [StockMovementType.ReturnDamage] = "Return (Damage)",
        [StockMovementType.PoReceipt] = "PO Receipt",
        [StockMovementType.RtsDispatch] = "RTS Dispatch",
        [StockMovementType.RtsRestore] = "RTS Restore",
        [StockMovementType.TransferOut] = "Transfer Out",
        [StockMovementType.TransferIn] = "Transfer In",
        [StockMovementType.Adjustment] = "Adjustment",
    };

    [HttpGet]
    public async Task<ActionResult<List<StockMovementDto>>> List(CancellationToken ct)
    {
        var movements = await db.StockMovements.Include(m => m.Product).Include(m => m.Branch)
            .OrderByDescending(m => m.CreatedAt).ToListAsync(ct);

        var userIds = movements.Where(m => m.UserId != null).Select(m => m.UserId!.Value).Distinct().ToList();
        var userNames = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        return Ok(movements.Select(m => new StockMovementDto(
            m.Id, m.CreatedAt, TypeLabels.GetValueOrDefault(m.Type, m.Type.ToString()),
            m.ProductId, m.Product?.Sku ?? "", m.Product?.NameEn ?? "",
            m.BranchId, m.Branch?.NameEn ?? "", m.Qty, m.Qty >= 0 ? "In" : "Out",
            m.RefTable, m.RefId, m.UserId is not null && userNames.TryGetValue(m.UserId.Value, out var n) ? n : null)).ToList());
    }
}
