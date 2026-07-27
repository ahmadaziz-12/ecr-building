using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Catalog;
using EcrBuilding.Application.Procurement;
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
public class PurchaseOrdersController(AppDbContext db, IAuditService audit, IGlPostingService gl) : ControllerBase
{
    private IQueryable<PurchaseOrder> WithIncludes() => db.PurchaseOrders.Include(p => p.Supplier)
        .Include(p => p.Lines).ThenInclude(l => l.Product)
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
        var poNo = $"PO-{DateTime.UtcNow:yyyy}-{await db.PurchaseOrders.CountAsync(ct) + 1:D4}";
        var po = new PurchaseOrder
        {
            PoNo = poNo, SupplierId = request.SupplierId, Currency = request.Currency,
            ExpectedDate = request.ExpectedDate, Shipping = request.Shipping, Incoterm = request.Incoterm,
            ApproverUserId = request.ApproverUserId,
            Lines = request.Lines.Select(l => new PurchaseOrderLine
            {
                ProductId = l.ProductId, BranchId = l.BranchId, WarehouseId = l.WarehouseId,
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
        foreach (var receiveLine in request.Lines)
        {
            var line = po.Lines.FirstOrDefault(l => l.Id == receiveLine.LineId);
            if (line is null) continue;

            line.ReceivedQty = Math.Min(line.Qty, line.ReceivedQty + receiveLine.Qty);
            receivedValue += receiveLine.Qty * line.UnitCost;

            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == line.WarehouseId, ct);
            if (level is null)
            {
                level = new StockLevel { ProductId = line.ProductId, WarehouseId = line.WarehouseId };
                db.StockLevels.Add(level);
            }
            level.OnHand += receiveLine.Qty;

            var batchNo = receiveLine.BatchNo ?? line.BatchNo;
            var expiryDate = receiveLine.ExpiryDate ?? line.ExpiryDate;
            if (!string.IsNullOrWhiteSpace(batchNo) && expiryDate is not null)
            {
                var batch = await db.StockBatches.FirstOrDefaultAsync(
                    b => b.ProductId == line.ProductId && b.WarehouseId == line.WarehouseId && b.BatchNo == batchNo, ct);
                if (batch is null)
                {
                    batch = new StockBatch
                    {
                        ProductId = line.ProductId, WarehouseId = line.WarehouseId, BatchNo = batchNo,
                        ReceivedDate = DateTime.UtcNow, ExpiryDate = expiryDate.Value,
                    };
                    db.StockBatches.Add(batch);
                }
                batch.Qty += receiveLine.Qty;
            }
        }

        po.Status = po.Lines.All(l => l.ReceivedQty >= l.Qty) ? PurchaseOrderStatus.Received
            : po.Lines.Any(l => l.ReceivedQty > 0) ? PurchaseOrderStatus.PartialReceive : po.Status;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("suppliers", "PO_RECEIVED", po.Id.ToString(), newValue: request, cancellationToken: ct);

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
        var expectedTotalQty = p.Lines.Sum(l => l.Qty);
        var receivedPct = expectedTotalQty == 0 ? 0 : Math.Round(p.Lines.Sum(l => l.ReceivedQty) / expectedTotalQty * 100, 1);
        var isDelayed = p.ExpectedDate < DateTime.UtcNow &&
            p.Status is PurchaseOrderStatus.Sent or PurchaseOrderStatus.InTransit or PurchaseOrderStatus.PartialReceive;
        var status = isDelayed ? "Delayed" : p.Status.ToString();

        return new PurchaseOrderDto(
            p.Id, p.PoNo, p.SupplierId, p.Supplier?.NameEn ?? "",
            p.Lines.Select(l => l.Branch?.NameEn ?? "").Where(n => n != "").Distinct().ToArray(),
            p.Currency, p.ExpectedDate, status, p.Shipping, p.Incoterm, p.Carrier, p.TrackingRef,
            p.Lines.Sum(l => l.Qty * l.UnitCost) + p.Shipping, receivedPct,
            p.Lines.Select(l => new PurchaseOrderLineDto(
                l.Id, l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "",
                l.BranchId, l.Branch?.NameEn ?? "", l.WarehouseId, l.Warehouse?.Name ?? "",
                l.Qty, l.UnitCost, l.ReceivedQty, l.BatchNo, l.ExpiryDate)).ToList());
    }
}

[ApiController]
[Route("api/procurement/rts")]
[Authorize]
[RequireModule(ModuleArea.Suppliers, AccessLevel.View)]
public class ReturnToSupplierController(AppDbContext db, IAuditService audit, IGlPostingService gl) : ControllerBase
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
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == rts.WarehouseId, ct);
            if (level is null || level.Available < line.Qty)
            {
                return BadRequest(new { error = $"Insufficient available stock for product {line.ProductId} at the selected warehouse." });
            }
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
        // goods never actually left (or came back into) our stock.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in rts.Lines)
        {
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
