using System.Security.Claims;
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

// Automatic Stock Count — the stocktake workflow that replaces hand-built count sheets.
//
// Generate materialises the sheet from live stock for a chosen scope (whole warehouse, one
// category, only what's already low, the highest-value or fastest-moving lines) and snapshots
// SystemQty + UnitCost per line, so a sale landing mid-count can't move the baseline the variance
// is measured against. Counters then key or scan quantities; Post applies every variance in one
// transaction by writing exactly one StockAdjustment — the same record an ad-hoc correction
// produces — so stocktakes and manual corrections share one ledger, one audit trail and one
// StockMovement stream.
[ApiController]
[Route("api/inventory/stock-counts")]
[Authorize]
[RequireModule("/stock/stock-count", PermissionAction.View)]
public class StockCountsController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements) : ControllerBase
{
    private int CurrentUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<List<StockCountDto>>> List(
        [FromQuery] int? warehouseId, [FromQuery] int? branchId, [FromQuery] string? status,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct = default)
    {
        var query = BaseQuery();
        if (warehouseId is not null) query = query.Where(c => c.WarehouseId == warehouseId);
        if (branchId is not null) query = query.Where(c => c.Warehouse!.BranchId == branchId);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<StockCountStatus>(status, true, out var s))
            query = query.Where(c => c.Status == s);
        // Exclusive upper bound, same as every report filter: `to` arrives as a bare calendar day,
        // so `<= to` would drop every count scheduled after midnight on that day — including
        // "today", which is the range people actually ask for.
        if (from is not null) query = query.Where(c => c.ScheduledFor >= from.Value.Date);
        if (to is not null)
        {
            var toExclusive = to.Value.Date.AddDays(1);
            query = query.Where(c => c.ScheduledFor < toExclusive);
        }

        var counts = await query.OrderByDescending(c => c.ScheduledFor).ThenByDescending(c => c.Id).ToListAsync(ct);
        // The list view never needs every line — Map still computes the roll-ups from them, so the
        // lines are loaded but omitted from the payload.
        return Ok(counts.Select(c => Map(c, includeLines: false)).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<StockCountDto>> Get(int id, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        return Ok(Map(count, includeLines: true));
    }

    // The "automatic" half of automatic stock counting: pick a warehouse + scope, get a fully
    // populated, pre-valued count sheet back. Nothing is typed by hand.
    [HttpPost("generate")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> Generate(GenerateStockCountRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.Include(w => w.Branch).FirstOrDefaultAsync(w => w.Id == request.WarehouseId, ct);
        if (warehouse is null) return BadRequest(new { error = "Unknown warehouse." });
        if (!Enum.TryParse<StockCountScope>(request.Scope, true, out var scope))
            return BadRequest(new { error = $"Unknown scope \"{request.Scope}\"." });
        if (scope == StockCountScope.Category && request.CategoryId is null)
            return BadRequest(new { error = "A category scope needs a category." });

        // An open count on the same warehouse would let two sheets post conflicting absolute
        // quantities for the same product — the second post would silently overwrite the first.
        var openCount = await db.StockCounts.FirstOrDefaultAsync(
            c => c.WarehouseId == request.WarehouseId
                && (c.Status == StockCountStatus.Draft || c.Status == StockCountStatus.InProgress || c.Status == StockCountStatus.PendingApproval), ct);
        if (openCount is not null)
            return BadRequest(new { error = $"{openCount.CountNo} is still open on this warehouse. Post or cancel it first." });

        var levels = await db.StockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
            .Where(s => s.WarehouseId == request.WarehouseId)
            .ToListAsync(ct);
        // Products that have never had a StockLevel row here can still be physically present (that's
        // exactly the kind of drift a count exists to find), so a full-warehouse sheet may include
        // them at system-qty zero.
        if (scope == StockCountScope.FullWarehouse && request.IncludeZeroStock)
        {
            var known = levels.Select(l => l.ProductId).ToHashSet();
            var missing = await db.Products.Include(p => p.Category)
                .Where(p => p.Status == EntityStatus.Active && !known.Contains(p.Id)).ToListAsync(ct);
            levels.AddRange(missing.Select(p => new StockLevel { ProductId = p.Id, Product = p, WarehouseId = request.WarehouseId }));
        }

        IEnumerable<StockLevel> selected = levels.Where(l => l.Product is not null && l.Product.Status == EntityStatus.Active);
        if (!request.IncludeZeroStock) selected = selected.Where(l => l.OnHand != 0);

        switch (scope)
        {
            case StockCountScope.Category:
                selected = selected.Where(l => l.Product!.CategoryId == request.CategoryId);
                break;
            case StockCountScope.LowStock:
                selected = selected.Where(l => l.Available <= l.Product!.ReorderLevel);
                break;
            case StockCountScope.HighValue:
                selected = selected.OrderByDescending(l => l.OnHand * l.Product!.CostPrice).Take(Math.Clamp(request.TopN ?? 50, 1, 500));
                break;
            case StockCountScope.FastMoving:
            {
                var since = DateTime.UtcNow.AddDays(-30);
                var soldQty = await db.OrderLines
                    .Where(l => l.Order!.Status != OrderStatus.Voided && l.Order.CreatedAt >= since && l.Order.BranchId == warehouse.BranchId)
                    .GroupBy(l => l.ProductId)
                    .Select(g => new { ProductId = g.Key, Units = g.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty) })
                    .ToDictionaryAsync(x => x.ProductId, x => x.Units, ct);
                selected = selected.Where(l => soldQty.ContainsKey(l.ProductId))
                    .OrderByDescending(l => soldQty[l.ProductId])
                    .Take(Math.Clamp(request.TopN ?? 50, 1, 500));
                break;
            }
        }

        var sheet = selected.OrderBy(l => l.Product!.Sku).ToList();
        if (sheet.Count == 0) return BadRequest(new { error = "No stock matches that scope — nothing to count." });

        var count = new StockCount
        {
            CountNo = $"SC-{DateTime.UtcNow:yyyy}-{await db.StockCounts.CountAsync(ct) + 1:D4}",
            WarehouseId = request.WarehouseId,
            Scope = scope,
            CategoryId = scope == StockCountScope.Category ? request.CategoryId : null,
            Status = StockCountStatus.InProgress,
            ScheduledFor = request.ScheduledFor ?? DateTime.UtcNow,
            StartedAt = DateTime.UtcNow,
            CountedByUserId = CurrentUserId(),
            Notes = request.Notes,
            AutoFillUncounted = request.AutoFillUncounted,
            BlindCount = request.BlindCount,
            Lines = sheet.Select(l => new StockCountLine
            {
                ProductId = l.ProductId,
                SystemQty = l.OnHand,
                UnitCost = l.Product!.CostPrice,
            }).ToList(),
        };
        db.StockCounts.Add(count);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "STOCK_COUNT_GENERATED", count.Id.ToString(),
            newValue: new { count.CountNo, count.WarehouseId, Scope = scope.ToString(), Lines = count.Lines.Count }, cancellationToken: ct);

        var created = await BaseQuery().FirstAsync(c => c.Id == count.Id, ct);
        return Ok(Map(created, includeLines: true));
    }

    // Bulk-save counted quantities. Sent as the counter works (autosave) rather than only at the
    // end, so a closed tab doesn't lose an hour of counting.
    [HttpPut("{id:int}/lines")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> SaveLines(int id, SaveStockCountLinesRequest request, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status is StockCountStatus.Completed or StockCountStatus.Cancelled)
            return BadRequest(new { error = $"{count.CountNo} is {count.Status} — its lines are frozen." });

        var userId = CurrentUserId();
        var byId = count.Lines.ToDictionary(l => l.Id);
        foreach (var input in request.Lines)
        {
            if (!byId.TryGetValue(input.LineId, out var line)) continue;
            if (input.CountedQty is not null && input.CountedQty < 0)
                return BadRequest(new { error = "A counted quantity can't be negative." });
            line.CountedQty = input.CountedQty;
            line.Note = input.Note;
            line.CountedAt = input.CountedQty is null ? null : DateTime.UtcNow;
            line.CountedByUserId = input.CountedQty is null ? null : userId;
        }
        if (count.Status == StockCountStatus.Draft)
        {
            count.Status = StockCountStatus.InProgress;
            count.StartedAt ??= DateTime.UtcNow;
        }
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(count, includeLines: true));
    }

    // Barcode/SKU entry: each scan bumps the counted quantity for that line, so a counter can walk
    // the aisle with a scanner instead of hunting for rows in a table.
    [HttpPost("{id:int}/scan")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> Scan(int id, ScanStockCountRequest request, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status is StockCountStatus.Completed or StockCountStatus.Cancelled)
            return BadRequest(new { error = $"{count.CountNo} is {count.Status} — its lines are frozen." });

        var code = request.Code.Trim();
        var line = count.Lines.FirstOrDefault(l =>
            string.Equals(l.Product?.Barcode, code, StringComparison.OrdinalIgnoreCase)
            || string.Equals(l.Product?.Sku, code, StringComparison.OrdinalIgnoreCase));
        if (line is null) return BadRequest(new { error = $"\"{code}\" isn't on this count sheet." });

        line.CountedQty = request.Increment ? (line.CountedQty ?? 0) + request.Qty : request.Qty;
        line.CountedAt = DateTime.UtcNow;
        line.CountedByUserId = CurrentUserId();
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(count, includeLines: true));
    }

    // Accept the system quantity for every line nobody has counted yet — the usual way a partial
    // cycle count is closed out ("everything I didn't get to was fine").
    [HttpPost("{id:int}/auto-fill")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> AutoFill(int id, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status is StockCountStatus.Completed or StockCountStatus.Cancelled)
            return BadRequest(new { error = $"{count.CountNo} is {count.Status} — its lines are frozen." });

        var userId = CurrentUserId();
        foreach (var line in count.Lines.Where(l => l.CountedQty is null))
        {
            line.CountedQty = line.SystemQty;
            line.CountedAt = DateTime.UtcNow;
            line.CountedByUserId = userId;
            line.Note ??= "Auto-filled from system quantity";
        }
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "STOCK_COUNT_AUTOFILLED", id.ToString(), cancellationToken: ct);
        return Ok(Map(count, includeLines: true));
    }

    // Close counting and hand the sheet to a reviewer. Separating "I've finished counting" from "I
    // approve moving the stock" is what makes the variance auditable — the counter and the approver
    // are different people, and nothing touches stock until Post.
    [HttpPost("{id:int}/submit")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> Submit(int id, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status is not (StockCountStatus.Draft or StockCountStatus.InProgress))
            return BadRequest(new { error = $"{count.CountNo} is {count.Status} — it can't be submitted for review." });

        var uncounted = count.Lines.Count(l => l.CountedQty is null);
        if (uncounted == count.Lines.Count)
            return BadRequest(new { error = "Nothing has been counted yet." });
        if (uncounted > 0 && !count.AutoFillUncounted)
            return BadRequest(new { error = $"{uncounted} line(s) are still uncounted, and this count doesn't auto-fill." });

        count.Status = StockCountStatus.PendingApproval;
        count.CompletedAt = DateTime.UtcNow;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "STOCK_COUNT_SUBMITTED", id.ToString(),
            newValue: new { count.CountNo, Uncounted = uncounted }, cancellationToken: ct);
        return Ok(Map(count, includeLines: true));
    }

    // Post the variance. Sets both stock pools to the counted absolute quantity (same
    // single-warehouse-per-branch invariant StockAdjustmentsController establishes) and records one
    // StockAdjustment plus one StockMovement per non-zero variance.
    [HttpPost("{id:int}/post")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> Post(int id, PostStockCountRequest request, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status == StockCountStatus.Completed) return BadRequest(new { error = $"{count.CountNo} has already been posted." });
        if (count.Status == StockCountStatus.Cancelled) return BadRequest(new { error = $"{count.CountNo} was cancelled." });

        var warehouse = await db.Warehouses.FirstOrDefaultAsync(w => w.Id == count.WarehouseId, ct);
        if (warehouse is null) return BadRequest(new { error = "Unknown warehouse." });

        var uncounted = count.Lines.Where(l => l.CountedQty is null).ToList();
        if (uncounted.Count > 0 && !count.AutoFillUncounted)
            return BadRequest(new { error = $"{uncounted.Count} line(s) are still uncounted, and this count doesn't auto-fill." });

        var userId = CurrentUserId();
        foreach (var line in uncounted)
        {
            line.CountedQty = line.SystemQty;
            line.CountedAt = DateTime.UtcNow;
            line.CountedByUserId = userId;
            line.Note ??= "Auto-filled at posting";
        }

        // Every line goes onto the adjustment, not just the variances — the adjustment is the
        // permanent record of what was counted, and a zero-variance line is evidence too.
        var adjustment = new StockAdjustment
        {
            Reason = $"Stock Count {count.CountNo}",
            WarehouseId = count.WarehouseId,
            Date = DateTime.UtcNow,
            ApproverUserId = request.ApproverUserId,
            EvidenceAttached = false,
            Lines = count.Lines.Select(l => new StockAdjustmentLine
            {
                ProductId = l.ProductId,
                SystemQty = l.SystemQty,
                CountedQty = l.CountedQty!.Value,
                Note = l.Note,
            }).ToList(),
        };
        db.StockAdjustments.Add(adjustment);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in count.Lines)
        {
            var counted = line.CountedQty!.Value;
            var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == count.WarehouseId, ct);
            if (level is null)
            {
                level = new StockLevel { ProductId = line.ProductId, WarehouseId = count.WarehouseId };
                db.StockLevels.Add(level);
            }
            level.OnHand = counted;

            var branchLevel = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == warehouse.BranchId, ct);
            if (branchLevel is null)
            {
                branchLevel = new BranchStockLevel { ProductId = line.ProductId, BranchId = warehouse.BranchId };
                db.BranchStockLevels.Add(branchLevel);
            }
            branchLevel.OnHand = counted;
        }

        count.Status = StockCountStatus.Completed;
        count.CompletedAt = DateTime.UtcNow;
        count.ApprovedByUserId = request.ApproverUserId ?? userId;
        if (!string.IsNullOrWhiteSpace(request.Notes)) count.Notes = request.Notes;
        await db.SaveChangesAsync(ct);

        count.StockAdjustmentId = adjustment.Id;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("inventory", "STOCK_COUNT_POSTED", count.Id.ToString(),
            newValue: new
            {
                count.CountNo,
                AdjustmentId = adjustment.Id,
                VarianceLines = count.Lines.Count(l => l.Variance != 0),
                NetVarianceValue = Math.Round(count.Lines.Sum(l => l.VarianceValue), 2),
            }, cancellationToken: ct);

        foreach (var line in count.Lines)
        {
            if (line.Variance == 0) continue;
            await stockMovements.RecordAsync(line.ProductId, warehouse.BranchId, StockMovementType.Adjustment, line.Variance,
                refTable: "StockCount", refId: count.Id.ToString(), cancellationToken: ct);
        }

        var posted = await BaseQuery().FirstAsync(c => c.Id == count.Id, ct);
        return Ok(Map(posted, includeLines: true));
    }

    [HttpPost("{id:int}/cancel")]
    [RequireModule("/stock/stock-count", PermissionAction.Edit)]
    public async Task<ActionResult<StockCountDto>> Cancel(int id, CancellationToken ct)
    {
        var count = await BaseQuery().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (count is null) return NotFound();
        if (count.Status == StockCountStatus.Completed)
            return BadRequest(new { error = $"{count.CountNo} has already been posted and can't be cancelled." });

        count.Status = StockCountStatus.Cancelled;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "STOCK_COUNT_CANCELLED", id.ToString(), cancellationToken: ct);
        return Ok(Map(count, includeLines: true));
    }

    private IQueryable<StockCount> BaseQuery() => db.StockCounts
        .Include(c => c.Warehouse).ThenInclude(w => w!.Branch)
        .Include(c => c.Category)
        .Include(c => c.CountedBy)
        .Include(c => c.ApprovedBy)
        .Include(c => c.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category);

    private static StockCountDto Map(StockCount c, bool includeLines)
    {
        var lines = c.Lines.OrderBy(l => l.Product?.Sku).ToList();
        var counted = lines.Where(l => l.CountedQty is not null).ToList();
        var varianceLines = counted.Count(l => l.Variance != 0);
        // Blind counts hide SystemQty (and everything derived from it) until the sheet is posted —
        // otherwise the "blind" is only a UI convention any API client could see straight past.
        var reveal = !c.BlindCount || c.Status is StockCountStatus.Completed or StockCountStatus.Cancelled;

        return new StockCountDto(
            c.Id, c.CountNo, c.WarehouseId, c.Warehouse?.Name ?? "",
            c.Warehouse?.BranchId ?? 0, c.Warehouse?.Branch?.NameEn ?? "",
            c.Scope.ToString(), c.CategoryId, c.Category?.NameEn, c.Status.ToString(),
            c.ScheduledFor, c.StartedAt, c.CompletedAt,
            c.CountedBy?.Name, c.ApprovedBy?.Name, c.Notes,
            c.AutoFillUncounted, c.BlindCount, c.StockAdjustmentId,
            lines.Count, counted.Count, varianceLines,
            Math.Round(counted.Sum(l => l.Variance), 2),
            Math.Round(counted.Sum(l => l.VarianceValue), 2),
            Math.Round(counted.Sum(l => Math.Abs(l.VarianceValue)), 2),
            counted.Count == 0 ? 100m : Math.Round((decimal)(counted.Count - varianceLines) / counted.Count * 100m, 2),
            includeLines
                ? lines.Select(l => new StockCountLineDto(
                    l.Id, l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "",
                    l.Product?.Category?.NameEn ?? "", l.Product?.StockUom ?? "", l.Product?.BinLocation,
                    l.Product?.Barcode,
                    reveal ? l.SystemQty : null,
                    l.CountedQty,
                    reveal && l.CountedQty is not null ? l.Variance : null,
                    reveal && l.CountedQty is not null ? Math.Round(l.VarianceValue, 2) : null,
                    l.UnitCost, l.Note, l.CountedAt,
                    l.CountedQty is null ? "Uncounted" : l.Variance == 0 ? "Matched" : l.Variance > 0 ? "Overage" : "Shortage")).ToList()
                : []);
    }
}
