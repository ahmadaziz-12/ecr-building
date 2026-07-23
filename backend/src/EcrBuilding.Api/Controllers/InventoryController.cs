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
        var reservationCounts = await db.StockLevels.Where(s => s.Reserved > 0).GroupBy(s => s.WarehouseId)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return Ok(warehouses.Select(w => Map(w, reservationCounts.GetValueOrDefault(w.Id))).ToList());
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
        return Ok(Map(warehouse, 0));
    }

    private static WarehouseDto Map(Warehouse w, int reservationCount) => new(
        w.Id, w.Code, w.Name, w.BranchId, w.Branch?.NameEn ?? "", w.Type.ToString(), w.Status.ToString(),
        w.Bins.Select(b => new WarehouseBinDto(b.Id, b.BinCode, b.Label, b.CapacityTons, b.FilledTons)).ToList(),
        reservationCount, reservationCount == 0);
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
public class StockTransfersController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<StockTransferDto>>> List(CancellationToken ct)
    {
        var transfers = await db.StockTransfers.Include(t => t.FromWarehouse).Include(t => t.ToWarehouse)
            .Include(t => t.Lines).ThenInclude(l => l.Product).OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        return Ok(transfers.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Create(CreateStockTransferRequest request, CancellationToken ct)
    {
        if (request.FromWarehouseId == request.ToWarehouseId)
        {
            return BadRequest(new { error = "Source and destination warehouse must differ." });
        }

        var transferNo = $"TRF-{DateTime.UtcNow:yyyy}-{await db.StockTransfers.CountAsync(ct) + 1:D4}";
        var transfer = new StockTransfer
        {
            TransferNo = transferNo, FromWarehouseId = request.FromWarehouseId, ToWarehouseId = request.ToWarehouseId,
            Eta = request.Eta, Carrier = request.Carrier, Notes = request.Notes,
            Lines = request.Lines.Select(l => new StockTransferLine { ProductId = l.ProductId, Qty = l.Qty, UnitCost = l.UnitCost }).ToList(),
        };
        db.StockTransfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_CREATED", transfer.Id.ToString(), newValue: request, cancellationToken: ct);

        await db.Entry(transfer).Reference(t => t.FromWarehouse).LoadAsync(ct);
        await db.Entry(transfer).Reference(t => t.ToWarehouse).LoadAsync(ct);
        foreach (var line in transfer.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(transfer));
    }

    [HttpPut("{id:int}/approve")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Approve(int id, CancellationToken ct)
    {
        var transfer = await db.StockTransfers.Include(t => t.Lines).ThenInclude(l => l.Product)
            .Include(t => t.FromWarehouse).Include(t => t.ToWarehouse).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status != Domain.Entities.StockTransferStatus.Draft) return BadRequest(new { error = "Only draft transfers can be approved." });

        transfer.Status = Domain.Entities.StockTransferStatus.Approved;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_APPROVED", transfer.Id.ToString(), cancellationToken: ct);
        return Ok(Map(transfer));
    }

    [HttpPut("{id:int}/dispatch")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Dispatch(int id, CancellationToken ct)
    {
        var transfer = await db.StockTransfers.Include(t => t.Lines).ThenInclude(l => l.Product)
            .Include(t => t.FromWarehouse).Include(t => t.ToWarehouse).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status != Domain.Entities.StockTransferStatus.Approved) return BadRequest(new { error = "Only approved transfers can be dispatched." });

        transfer.Status = Domain.Entities.StockTransferStatus.InTransit;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_DISPATCHED", transfer.Id.ToString(), cancellationToken: ct);
        return Ok(Map(transfer));
    }

    [HttpPut("{id:int}/receive")]
    [RequireModule(ModuleArea.Inventory, AccessLevel.Edit)]
    public async Task<ActionResult<StockTransferDto>> Receive(int id, CancellationToken ct)
    {
        var transfer = await db.StockTransfers.Include(t => t.Lines).Include(t => t.FromWarehouse).Include(t => t.ToWarehouse).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return NotFound();
        if (transfer.Status == Domain.Entities.StockTransferStatus.Received) return BadRequest(new { error = "Transfer already received." });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in transfer.Lines)
        {
            var from = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == transfer.FromWarehouseId, ct);
            if (from is null || from.Available < line.Qty)
            {
                transfer.Status = Domain.Entities.StockTransferStatus.Discrepancy;
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return BadRequest(new { error = $"Insufficient stock for product {line.ProductId} at source warehouse." });
            }
            from.OnHand -= line.Qty;

            var to = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == transfer.ToWarehouseId, ct);
            if (to is null)
            {
                to = new StockLevel { ProductId = line.ProductId, WarehouseId = transfer.ToWarehouseId };
                db.StockLevels.Add(to);
            }
            to.OnHand += line.Qty;
        }

        transfer.Status = Domain.Entities.StockTransferStatus.Received;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("inventory", "TRANSFER_RECEIVED", transfer.Id.ToString(), cancellationToken: ct);

        foreach (var line in transfer.Lines) await db.Entry(line).Reference(l => l.Product).LoadAsync(ct);
        return Ok(Map(transfer));
    }

    private static StockTransferDto Map(StockTransfer t) => new(
        t.Id, t.TransferNo, t.FromWarehouseId, t.FromWarehouse?.Name ?? "", t.ToWarehouseId, t.ToWarehouse?.Name ?? "",
        t.Status.ToString(), t.Eta, t.Carrier, t.Notes, t.Lines.Sum(l => l.Qty * l.UnitCost),
        t.Lines.Select(l => new StockTransferLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.UnitCost)).ToList());
}

[ApiController]
[Route("api/inventory/adjustments")]
[Authorize]
[RequireModule(ModuleArea.Inventory, AccessLevel.View)]
public class StockAdjustmentsController(AppDbContext db, IAuditService audit) : ControllerBase
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
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("inventory", "STOCK_ADJUSTMENT_APPLIED", adjustment.Id.ToString(), newValue: request, cancellationToken: ct);
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
