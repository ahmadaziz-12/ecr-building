using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Catalog;
using EcrBuilding.Application.Procurement;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/procurement/suppliers")]
[Authorize]
[RequireModule(ModuleArea.Suppliers, AccessLevel.View)]
public class SuppliersController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<SupplierDto>>> List(CancellationToken ct)
    {
        var suppliers = await db.Suppliers.OrderBy(s => s.Code).ToListAsync(ct);
        return Ok(suppliers.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<SupplierDto>> Create(UpsertSupplierRequest request, CancellationToken ct)
    {
        var supplier = new Supplier
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr, Type = request.Type,
            VatNo = request.VatNo, Phone = request.Phone, Email = request.Email,
            CategoriesJson = JsonSerializer.Serialize(request.Categories), Terms = request.Terms,
            Currency = request.Currency, LeadTimeDays = request.LeadTimeDays, Iban = request.Iban,
        };
        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "SUPPLIER_CREATED", supplier.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(supplier));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<SupplierDto>> Update(int id, UpsertSupplierRequest request, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();

        var old = Map(supplier);
        supplier.Code = request.Code;
        supplier.NameEn = request.NameEn;
        supplier.NameAr = request.NameAr;
        supplier.Type = request.Type;
        supplier.VatNo = request.VatNo;
        supplier.Phone = request.Phone;
        supplier.Email = request.Email;
        supplier.CategoriesJson = JsonSerializer.Serialize(request.Categories);
        supplier.Terms = request.Terms;
        supplier.Currency = request.Currency;
        supplier.LeadTimeDays = request.LeadTimeDays;
        supplier.Iban = request.Iban;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "SUPPLIER_UPDATED", id.ToString(), oldValue: old, newValue: Map(supplier), cancellationToken: ct);
        return Ok(Map(supplier));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<SupplierDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        supplier.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "SUPPLIER_STATUS_CHANGED", supplier.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(supplier));
    }

    [HttpGet("{id:int}/ledger")]
    public async Task<ActionResult<List<SupplierLedgerLineDto>>> Ledger(int id, CancellationToken ct)
    {
        var poNos = await db.PurchaseOrders.Where(p => p.SupplierId == id).Select(p => p.PoNo).ToListAsync(ct);
        var rtsNos = await db.ReturnToSuppliers.Where(r => r.SupplierId == id).Select(r => r.RtsNo).ToListAsync(ct);
        var references = poNos.Concat(rtsNos).ToList();
        if (references.Count == 0) return Ok(new List<SupplierLedgerLineDto>());

        var entries = await db.JournalEntries.Include(e => e.Lines).ThenInclude(l => l.Account)
            .Where(e => references.Contains(e.Reference)).OrderBy(e => e.Date).ToListAsync(ct);

        var rows = entries.SelectMany(e => e.Lines.Select(l =>
            new SupplierLedgerLineDto(e.Date, e.Reference, e.Description, l.Account?.Code ?? "", l.Account?.Name ?? "", l.Debit, l.Credit))).ToList();
        return Ok(rows);
    }

    private static SupplierDto Map(Supplier s) => new(
        s.Id, s.Code, s.NameEn, s.NameAr, s.Type, s.VatNo, s.Phone, s.Email,
        JsonSerializer.Deserialize<string[]>(s.CategoriesJson) ?? [], s.Terms, s.Currency, s.LeadTimeDays, s.Iban, s.Status.ToString());
}

[ApiController]
[Route("api/procurement/purchase-orders")]
[Authorize]
[RequireModule(ModuleArea.Suppliers, AccessLevel.View)]
public class PurchaseOrdersController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements, IGlPostingService gl) : ControllerBase
{
    private IQueryable<PurchaseOrder> WithIncludes() => db.PurchaseOrders.Include(p => p.Supplier)
        .Include(p => p.Lines).ThenInclude(l => l.Product).ThenInclude(pr => pr!.UomConversions)
        .Include(p => p.Lines).ThenInclude(l => l.Branch)
        .Include(p => p.Lines).ThenInclude(l => l.Warehouse);

    [HttpGet]
    public async Task<ActionResult<List<PurchaseOrderDto>>> List(CancellationToken ct)
    {
        var pos = await WithIncludes().OrderByDescending(p => p.CreatedAt).ToListAsync(ct);
        return Ok(pos.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<PurchaseOrderDto>> Create(CreatePurchaseOrderRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0) return BadRequest(new { error = "At least one PO line is required." });

        // When a line does name a warehouse, it must belong to that line's branch — a mismatched pair
        // would silently receive goods into a warehouse that can never feed that branch's sellable
        // stock. A branch with no warehouse linked yet is still orderable: Receive credits its
        // sellable stock directly and just skips the warehouse-side bin/batch/expiry bookkeeping.
        var warehouseIds = request.Lines.Where(l => l.WarehouseId is not null).Select(l => l.WarehouseId!.Value).Distinct().ToList();
        var warehouseBranch = await db.Warehouses.Where(w => warehouseIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.BranchId, ct);
        var productIds = request.Lines.Select(l => l.ProductId).Distinct().ToList();
        var products = await db.Products.Include(p => p.UomConversions).Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        foreach (var line in request.Lines)
        {
            if (line.WarehouseId is not null)
            {
                if (!warehouseBranch.TryGetValue(line.WarehouseId.Value, out var warehouseBranchId))
                {
                    return BadRequest(new { error = $"Unknown warehouse #{line.WarehouseId}." });
                }
                if (warehouseBranchId != line.BranchId)
                {
                    return BadRequest(new { error = "The selected warehouse must belong to the selected branch." });
                }
            }
            if (!products.TryGetValue(line.ProductId, out var product))
            {
                return BadRequest(new { error = $"Unknown product #{line.ProductId}." });
            }
            if (line.Qty <= 0)
            {
                return BadRequest(new { error = $"Quantity for {product.Sku} must be greater than zero." });
            }
            // Same rule the POS cart enforces at checkout — an unconfigured UOM is a hard error, never
            // silently treated as 1:1 (see UomMath.FactorToStock's contract).
            var uom = string.IsNullOrWhiteSpace(line.Uom) ? product.StockUom : line.Uom;
            var factor = UomMath.FactorToStock(uom, product.StockUom, product.UomConversions.Select(c => (c.Uom, c.FactorToStock)));
            if (factor is null)
            {
                return BadRequest(new { error = $"\"{uom}\" is not a configured unit for {product.Sku} (stock unit: {product.StockUom})." });
            }
        }

        var poNo = $"PO-{DateTime.UtcNow:yyyy}-{await db.PurchaseOrders.CountAsync(ct) + 1:D4}";
        var po = new PurchaseOrder
        {
            PoNo = poNo, SupplierId = request.SupplierId, Currency = request.Currency,
            ExpectedDate = request.ExpectedDate, Shipping = request.Shipping, Incoterm = request.Incoterm,
            ApproverUserId = request.ApproverUserId,
            Lines = request.Lines.Select(l => new PurchaseOrderLine
            {
                ProductId = l.ProductId, BranchId = l.BranchId, WarehouseId = l.WarehouseId,
                Uom = string.IsNullOrWhiteSpace(l.Uom) ? products[l.ProductId].StockUom : l.Uom!,
                Qty = l.Qty, UnitCost = l.UnitCost, BatchNo = l.BatchNo, ExpiryDate = l.ExpiryDate,
            }).ToList(),
        };
        db.PurchaseOrders.Add(po);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "PO_CREATED", po.Id.ToString(), newValue: request, cancellationToken: ct);

        var created = await WithIncludes().FirstAsync(p => p.Id == po.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/submit")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public Task<ActionResult<PurchaseOrderDto>> Submit(int id, CancellationToken ct) =>
        Transition(id, PurchaseOrderStatus.Draft, PurchaseOrderStatus.PendingApproval, "PO_SUBMITTED", null, ct);

    [HttpPut("{id:int}/approve")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public Task<ActionResult<PurchaseOrderDto>> Approve(int id, ApprovePurchaseOrderRequest request, CancellationToken ct) =>
        Transition(id, PurchaseOrderStatus.PendingApproval, PurchaseOrderStatus.Sent, "PO_APPROVED",
            po => po.ApproverUserId = request.ApproverUserId ?? po.ApproverUserId, ct);

    [HttpPut("{id:int}/dispatch")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public Task<ActionResult<PurchaseOrderDto>> Dispatch(int id, DispatchPurchaseOrderRequest request, CancellationToken ct) =>
        Transition(id, PurchaseOrderStatus.Sent, PurchaseOrderStatus.InTransit, "PO_DISPATCHED",
            po => { po.Carrier = request.Carrier; po.TrackingRef = request.TrackingRef; }, ct);

    [HttpPut("{id:int}/cancel")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<PurchaseOrderDto>> Cancel(int id, CancellationToken ct)
    {
        var po = await WithIncludes().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (po is null) return NotFound();
        if (po.Status is not (PurchaseOrderStatus.Draft or PurchaseOrderStatus.PendingApproval or PurchaseOrderStatus.Sent))
        {
            return BadRequest(new { error = "Only a Draft, Pending Approval, or Sent PO can be cancelled." });
        }
        po.Status = PurchaseOrderStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "PO_CANCELLED", po.Id.ToString(), cancellationToken: ct);
        return Ok(Map(po));
    }

    private async Task<ActionResult<PurchaseOrderDto>> Transition(int id, PurchaseOrderStatus from, PurchaseOrderStatus to, string auditEvent, Action<PurchaseOrder>? apply, CancellationToken ct)
    {
        var po = await WithIncludes().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (po is null) return NotFound();
        if (po.Status != from) return BadRequest(new { error = $"PO must be {from} to perform this action (currently {po.Status})." });

        apply?.Invoke(po);
        po.Status = to;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", auditEvent, po.Id.ToString(), cancellationToken: ct);
        return Ok(Map(po));
    }

    [HttpPut("{id:int}/receive")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<PurchaseOrderDto>> Receive(int id, ReceivePurchaseOrderRequest request, CancellationToken ct)
    {
        var po = await WithIncludes().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (po is null) return NotFound();
        if (po.Status is not (PurchaseOrderStatus.Sent or PurchaseOrderStatus.InTransit or PurchaseOrderStatus.PartialReceive))
        {
            return BadRequest(new { error = "PO must be Sent, In Transit, or Partially Received to receive goods." });
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        decimal receivedValue = 0;
        var movements = new List<(int ProductId, int BranchId, decimal Qty)>();
        foreach (var receiveLine in request.Lines)
        {
            var line = po.Lines.FirstOrDefault(l => l.Id == receiveLine.LineId);
            if (line is null || line.Product is null) continue;
            if (receiveLine.Qty <= 0) continue;

            var remaining = line.Qty - line.ReceivedQty;
            if (receiveLine.Qty > remaining)
            {
                return BadRequest(new { error = $"{line.Product.Sku}: cannot receive {receiveLine.Qty} {line.Uom} — only {remaining} {line.Uom} outstanding." });
            }

            // Goods received against a PO land on the receiving BRANCH's own yard — this business has
            // one warehouse per branch (Warehouse.BranchId), never a separate central DC — so the stock
            // must become sellable at the till immediately, not sit invisible until a manual internal
            // transfer "arrives". Convert from the PO's purchasing UOM (e.g. Pallet) to stock UOM (e.g.
            // Bag) and credit BOTH pools with that same stock-UOM amount: BranchStockLevel (what POS
            // checkout reads/deducts) and StockLevel (warehouse-side bin/batch/expiry tracking) — kept
            // in lockstep so neither pool can drift from the other.
            var factor = UomMath.FactorToStock(line.Uom, line.Product.StockUom,
                line.Product.UomConversions.Select(c => (c.Uom, c.FactorToStock)));
            if (factor is null)
            {
                return BadRequest(new { error = $"{line.Product.Sku}: \"{line.Uom}\" is no longer a configured unit for this product — fix the product's UOM conversions before receiving." });
            }
            // Round the CUMULATIVE received quantity, not each call's own increment, and credit only
            // the difference from what was already credited — otherwise splitting one delivery across
            // several partial receives (normal for a part-shipped truck) can credit a different total
            // stock quantity than receiving it in one call, purely from 3dp rounding on each fragment
            // (e.g. 1+1+1 Piece receipts of a 0.0192-factor product credit 0.001 less than one 3-Piece
            // receipt of the same physical goods).
            var previousStockQty = UomMath.ToStockQty(line.ReceivedQty, factor.Value);
            line.ReceivedQty += receiveLine.Qty;
            receivedValue += receiveLine.Qty * line.UnitCost;
            var newStockQty = UomMath.ToStockQty(line.ReceivedQty, factor.Value);
            var stockQty = newStockQty - previousStockQty;

            var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == line.BranchId, ct);
            if (branchLevel is null)
            {
                branchLevel = new BranchStockLevel { ProductId = line.ProductId, BranchId = line.BranchId };
                db.BranchStockLevels.Add(branchLevel);
            }
            branchLevel.OnHand += stockQty;
            movements.Add((line.ProductId, line.BranchId, stockQty));

            // No warehouse linked to this line's branch — the branch's sellable stock above is already
            // credited, so there's nothing warehouse-side (bin/batch/expiry) left to track.
            if (line.WarehouseId is not null)
            {
                var warehouseId = line.WarehouseId.Value;
                var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == warehouseId, ct);
                if (level is null)
                {
                    level = new StockLevel { ProductId = line.ProductId, WarehouseId = warehouseId };
                    db.StockLevels.Add(level);
                }
                level.OnHand += stockQty;

                var batchNo = receiveLine.BatchNo ?? line.BatchNo;
                var expiryDate = receiveLine.ExpiryDate ?? line.ExpiryDate;
                if (!string.IsNullOrWhiteSpace(batchNo) && expiryDate is not null)
                {
                    var batch = await db.StockBatches.FirstOrDefaultAsync(
                        b => b.ProductId == line.ProductId && b.WarehouseId == warehouseId && b.BatchNo == batchNo, ct);
                    if (batch is null)
                    {
                        batch = new StockBatch
                        {
                            ProductId = line.ProductId, WarehouseId = warehouseId, BatchNo = batchNo,
                            ReceivedDate = DateTime.UtcNow, ExpiryDate = expiryDate.Value,
                        };
                        db.StockBatches.Add(batch);
                    }
                    batch.Qty += stockQty;
                }
            }
        }

        po.Status = po.Lines.All(l => l.ReceivedQty >= l.Qty) ? PurchaseOrderStatus.Received
            : po.Lines.Any(l => l.ReceivedQty > 0) ? PurchaseOrderStatus.PartialReceive : po.Status;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("suppliers", "PO_RECEIVED", po.Id.ToString(), newValue: request, cancellationToken: ct);
        foreach (var m in movements)
        {
            await stockMovements.RecordAsync(m.ProductId, m.BranchId, StockMovementType.PoReceipt, m.Qty,
                refTable: "PurchaseOrder", refId: po.Id.ToString(), cancellationToken: ct);
        }

        if (receivedValue > 0)
        {
            await gl.PostAsync(po.PoNo, $"Goods received from {po.Supplier?.NameEn}",
                [new GlLine("1200", receivedValue, 0), new GlLine("2000", 0, receivedValue)], ct);
        }
        return Ok(Map(po));
    }

    [HttpGet("{id:int}/history")]
    public async Task<ActionResult<List<AuditHistoryEntryDto>>> History(int id, CancellationToken ct)
    {
        var rows = await db.AuditLogs.Where(a => a.RecordId == id.ToString() && a.Event.StartsWith("PO_"))
            .OrderBy(a => a.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(a => new AuditHistoryEntryDto(a.Id, a.CreatedAt, a.Event, a.UserName, a.OldValue, a.NewValue, a.Reason)).ToList());
    }

    private static PurchaseOrderDto Map(PurchaseOrder p)
    {
        // Lines can mix UOMs (one ordered by the Pallet, another by the Bag) — summing raw Qty across
        // them isn't dimensionally meaningful, so progress is tracked by VALUE (Qty×UnitCost) instead,
        // which is unit-agnostic and doubles as "how much of the PO's spend has actually landed".
        var expectedValue = p.Lines.Sum(l => l.Qty * l.UnitCost);
        var receivedValue = p.Lines.Sum(l => l.ReceivedQty * l.UnitCost);
        var receivedPct = expectedValue == 0 ? 0 : Math.Round(receivedValue / expectedValue * 100, 1);
        var isDelayed = p.ExpectedDate < DateTime.UtcNow &&
            p.Status is PurchaseOrderStatus.Sent or PurchaseOrderStatus.InTransit or PurchaseOrderStatus.PartialReceive;
        var status = isDelayed ? "Delayed" : p.Status.ToString();

        return new PurchaseOrderDto(
            p.Id, p.PoNo, p.SupplierId, p.Supplier?.NameEn ?? "",
            p.Lines.Select(l => l.Branch?.NameEn ?? "").Where(n => n != "").Distinct().ToArray(),
            p.Currency, p.ExpectedDate, status, p.Shipping, p.Incoterm, p.Carrier, p.TrackingRef,
            expectedValue + p.Shipping, receivedPct,
            p.Lines.Select(l => new PurchaseOrderLineDto(
                l.Id, l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "",
                l.BranchId, l.Branch?.NameEn ?? "", l.WarehouseId, l.Warehouse?.Name ?? "",
                l.Uom, l.Product?.StockUom ?? "", l.Qty, l.UnitCost, l.ReceivedQty, l.BatchNo, l.ExpiryDate)).ToList());
    }
}

[ApiController]
[Route("api/procurement/rts")]
[Authorize]
[RequireModule(ModuleArea.Suppliers, AccessLevel.View)]
public class ReturnToSupplierController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements, IGlPostingService gl) : ControllerBase
{
    private IQueryable<ReturnToSupplier> WithIncludes() => db.ReturnToSuppliers.Include(r => r.Supplier)
        .Include(r => r.PurchaseOrder).Include(r => r.Branch).Include(r => r.Warehouse)
        .Include(r => r.Lines).ThenInclude(l => l.Product);

    [HttpGet]
    public async Task<ActionResult<List<ReturnToSupplierDto>>> List(CancellationToken ct)
    {
        var rows = await WithIncludes().OrderByDescending(r => r.Date).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnToSupplierDto>> Create(CreateRtsRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0) return BadRequest(new { error = "At least one return line is required." });

        var warehouse = await db.Warehouses.FindAsync([request.WarehouseId], ct);
        if (warehouse is null) return BadRequest(new { error = "Unknown warehouse." });
        if (warehouse.BranchId != request.BranchId)
        {
            return BadRequest(new { error = "The selected warehouse must belong to the selected branch." });
        }

        var productIds = request.Lines.Select(l => l.ProductId).Distinct().ToList();
        var products = await db.Products.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Sku, ct);
        foreach (var line in request.Lines)
        {
            if (!products.TryGetValue(line.ProductId, out var sku))
            {
                return BadRequest(new { error = $"Unknown product #{line.ProductId}." });
            }
            // A non-positive quantity would let Dispatch's stock decrement run BACKWARDS — crediting
            // stock into the branch's sellable pool for goods that were never received, with no
            // supplier shipment and no GL trail behind it.
            if (line.Qty <= 0)
            {
                return BadRequest(new { error = $"Quantity for {sku} must be greater than zero." });
            }
        }

        var rtsNo = $"RTS-{DateTime.UtcNow:yyyy}-{await db.ReturnToSuppliers.CountAsync(ct) + 1:D4}";
        var rts = new ReturnToSupplier
        {
            RtsNo = rtsNo, SupplierId = request.SupplierId, PurchaseOrderId = request.PurchaseOrderId,
            BranchId = request.BranchId, WarehouseId = request.WarehouseId,
            Reason = request.Reason, Date = request.Date, Carrier = request.Carrier,
            Lines = request.Lines.Select(l => new ReturnToSupplierLine
            {
                ProductId = l.ProductId, BatchNo = l.BatchNo, Qty = l.Qty, UnitCost = l.UnitCost,
            }).ToList(),
        };
        db.ReturnToSuppliers.Add(rts);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "RTS_CREATED", rts.Id.ToString(), newValue: request, cancellationToken: ct);

        var created = await WithIncludes().FirstAsync(r => r.Id == rts.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/dispatch")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnToSupplierDto>> Dispatch(int id, CancellationToken ct)
    {
        var rts = await WithIncludes().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rts is null) return NotFound();
        if (rts.Status != ReturnToSupplierStatus.Draft) return BadRequest(new { error = "Only a Draft return can be dispatched." });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in rts.Lines)
        {
            // Stock a PO receipt puts into a branch's sellable pool must come back out of that SAME
            // pool when it's shipped back to the supplier — debiting only the warehouse-side StockLevel
            // (as before) would leave BranchStockLevel overstated, letting the POS keep selling units
            // that already left the building.
            var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == rts.BranchId, ct);
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == rts.WarehouseId, ct);
            if (branchLevel is null || branchLevel.Available < line.Qty || level is null || level.Available < line.Qty)
            {
                return BadRequest(new { error = $"Insufficient available stock for product {line.ProductId} at the selected branch/warehouse." });
            }
            branchLevel.OnHand -= line.Qty;
            level.OnHand -= line.Qty;

            if (!string.IsNullOrWhiteSpace(line.BatchNo))
            {
                var batch = await db.StockBatches.FirstOrDefaultAsync(
                    b => b.ProductId == line.ProductId && b.WarehouseId == rts.WarehouseId && b.BatchNo == line.BatchNo, ct);
                if (batch is not null) batch.Qty = Math.Max(0, batch.Qty - line.Qty);
            }
        }
        rts.Status = ReturnToSupplierStatus.Dispatched;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("suppliers", "RTS_DISPATCHED", rts.Id.ToString(), cancellationToken: ct);
        foreach (var line in rts.Lines)
        {
            await stockMovements.RecordAsync(line.ProductId, rts.BranchId, StockMovementType.RtsDispatch, -line.Qty,
                refTable: "ReturnToSupplier", refId: rts.Id.ToString(), cancellationToken: ct);
        }
        return Ok(Map(rts));
    }

    [HttpPut("{id:int}/credit")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnToSupplierDto>> Credit(int id, CreditRtsRequest request, CancellationToken ct)
    {
        var rts = await WithIncludes().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rts is null) return NotFound();
        if (rts.Status != ReturnToSupplierStatus.Dispatched)
        {
            return BadRequest(new { error = "Only a Dispatched return can receive a credit note." });
        }

        rts.CreditNoteRef = request.CreditNoteRef;
        rts.Status = ReturnToSupplierStatus.CreditReceived;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "RTS_CREDIT_RECEIVED", rts.Id.ToString(), newValue: request, cancellationToken: ct);

        var value = rts.Lines.Sum(l => l.Qty * l.UnitCost);
        if (value > 0)
        {
            await gl.PostAsync(rts.RtsNo, $"Credit note from {rts.Supplier?.NameEn} for return {rts.RtsNo}",
                [new GlLine("2000", value, 0), new GlLine("1200", 0, value)], ct);
        }
        return Ok(Map(rts));
    }

    [HttpPut("{id:int}/reject")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnToSupplierDto>> Reject(int id, CancellationToken ct)
    {
        var rts = await WithIncludes().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rts is null) return NotFound();
        if (rts.Status != ReturnToSupplierStatus.Dispatched)
        {
            return BadRequest(new { error = "Only a Dispatched return can be rejected." });
        }

        // The supplier refused a dispatched return — restore what Dispatch removed, since the
        // goods never actually left (or came back into) our stock. Must credit the SAME two pools
        // Dispatch debited (BranchStockLevel + StockLevel) — crediting only the warehouse side, as
        // this used to, leaves BranchStockLevel permanently short by the rejected quantity even
        // though the goods physically never left the building.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in rts.Lines)
        {
            var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == rts.BranchId, ct);
            if (branchLevel is null)
            {
                branchLevel = new BranchStockLevel { ProductId = line.ProductId, BranchId = rts.BranchId };
                db.BranchStockLevels.Add(branchLevel);
            }
            branchLevel.OnHand += line.Qty;

            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == rts.WarehouseId, ct);
            if (level is not null) level.OnHand += line.Qty;

            if (!string.IsNullOrWhiteSpace(line.BatchNo))
            {
                var batch = await db.StockBatches.FirstOrDefaultAsync(
                    b => b.ProductId == line.ProductId && b.WarehouseId == rts.WarehouseId && b.BatchNo == line.BatchNo, ct);
                if (batch is not null) batch.Qty += line.Qty;
            }
        }
        rts.Status = ReturnToSupplierStatus.Rejected;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("suppliers", "RTS_REJECTED", rts.Id.ToString(), cancellationToken: ct);
        foreach (var line in rts.Lines)
        {
            await stockMovements.RecordAsync(line.ProductId, rts.BranchId, StockMovementType.RtsRestore, line.Qty,
                refTable: "ReturnToSupplier", refId: rts.Id.ToString(), cancellationToken: ct);
        }
        return Ok(Map(rts));
    }

    [HttpPut("{id:int}/cancel")]
    [RequireModule(ModuleArea.Suppliers, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnToSupplierDto>> Cancel(int id, CancellationToken ct)
    {
        var rts = await WithIncludes().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rts is null) return NotFound();
        if (rts.Status != ReturnToSupplierStatus.Draft) return BadRequest(new { error = "Only a Draft return can be cancelled." });

        rts.Status = ReturnToSupplierStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("suppliers", "RTS_CANCELLED", rts.Id.ToString(), cancellationToken: ct);
        return Ok(Map(rts));
    }

    [HttpGet("{id:int}/history")]
    public async Task<ActionResult<List<AuditHistoryEntryDto>>> History(int id, CancellationToken ct)
    {
        var rows = await db.AuditLogs.Where(a => a.RecordId == id.ToString() && a.Event.StartsWith("RTS_"))
            .OrderBy(a => a.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(a => new AuditHistoryEntryDto(a.Id, a.CreatedAt, a.Event, a.UserName, a.OldValue, a.NewValue, a.Reason)).ToList());
    }

    private static ReturnToSupplierDto Map(ReturnToSupplier r) => new(
        r.Id, r.RtsNo, r.SupplierId, r.Supplier?.NameEn ?? "", r.PurchaseOrderId, r.PurchaseOrder?.PoNo,
        r.BranchId, r.Branch?.NameEn ?? "", r.WarehouseId, r.Warehouse?.Name ?? "",
        r.Reason, r.Date, r.CreditNoteRef, r.Carrier, r.Status.ToString(),
        r.Lines.Select(l => new RtsLineDto(l.ProductId, l.Product?.Sku ?? "", l.BatchNo, l.Qty, l.UnitCost)).ToList());
}
