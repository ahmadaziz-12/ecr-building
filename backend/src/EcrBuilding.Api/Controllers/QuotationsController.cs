using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/pos/quotations")]
[Authorize]
[RequireModule("/operate/orders", PermissionAction.View)]
public class QuotationsController(AppDbContext db, IAuditService audit, IStockReservationService reservations) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<QuotationDto>>> List([FromQuery] string? status, CancellationToken ct)
    {
        await ExpireStale(ct);

        var query = Query();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<QuotationStatus>(status, ignoreCase: true, out var parsed))
        {
            query = query.Where(q => q.Status == parsed);
        }
        var rows = await query.OrderByDescending(q => q.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<QuotationDto>> Get(int id, CancellationToken ct)
    {
        await ExpireStale(ct);
        var q = await Query().FirstOrDefaultAsync(x => x.Id == id, ct);
        return q is null ? NotFound() : Ok(Map(q));
    }

    [HttpPost]
    [RequireModule("/operate/orders", PermissionAction.Create)]
    public async Task<ActionResult<QuotationDto>> Create(CreateQuotationRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0) return BadRequest(new { error = "A quotation needs at least one line." });
        // BRD §3.4: project code is mandatory. Customer reference (the customer's own PO/tracking
        // number) is genuinely optional — plenty of quotations are created before the customer has
        // given one.
        if (string.IsNullOrWhiteSpace(request.ProjectCode)) return BadRequest(new { error = "A project code is required on every quotation." });
        if (request.DiscountPct is < 0 or > 100) return BadRequest(new { error = "Discount must be between 0 and 100%." });

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var customer = request.CustomerId is null ? null : await db.Customers.FindAsync([request.CustomerId], ct);
        var (discountPct, isManualDiscount, quantityRules, promoRules) = await ResolvePricingAsync(request.BranchId, customer, request.DiscountPct, ct);

        if (request.Lines.Any(l => l.ManualUnitPrice is not null))
        {
            var priceError = await ValidatePriceOverrideAsync(request.BranchId, request.PriceOverrideApprovalRequestId, ct);
            if (priceError is not null) return BadRequest(new { error = priceError });
        }

        var quotation = new Quotation
        {
            QuoteNo = $"QT-{DateTime.UtcNow:yyyy}-{await db.Quotations.CountAsync(ct) + 1:D4}",
            BranchId = request.BranchId,
            CustomerId = request.CustomerId,
            CreatedByUserId = cashierId,
            ValidUntil = request.ValidUntil ?? DateTime.UtcNow.AddDays(15), // BRD §3.4 default
            ProjectCode = request.ProjectCode.Trim(),
            CustomerReference = request.CustomerReference?.Trim() ?? "",
            Notes = request.Notes,
        };

        var linesResult = await BuildLines(request.Lines, customer, discountPct, isManualDiscount, quantityRules, promoRules, ct);
        if (linesResult.Error is not null) return BadRequest(new { error = linesResult.Error });
        ApplyLines(quotation, linesResult.Lines!, discountPct);

        // A quotation holds the stock it quotes from the moment it's created — otherwise the same
        // material could be quoted to two customers and only one of them could ever actually get it.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var reserveError = await ReserveOrConflict(request.BranchId, quotation.Lines, ct);
        if (reserveError is not null) { await tx.RollbackAsync(ct); return reserveError!; }

        db.Quotations.Add(quotation);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("orders", "QUOTATION_CREATED", quotation.Id.ToString(), userId: cashierId, branchId: quotation.BranchId, cancellationToken: ct);

        var created = await Query().FirstAsync(q => q.Id == quotation.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/operate/orders", PermissionAction.Edit)]
    public async Task<ActionResult<QuotationDto>> Update(int id, UpdateQuotationRequest request, CancellationToken ct)
    {
        var quotation = await Query().FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quotation is null) return NotFound();
        // Editable up to the moment the customer accepts it — once Accepted/Converted the terms are
        // considered final, and Rejected/Expired/Cancelled quotations are dead ends, not edit targets.
        if (quotation.Status is not (QuotationStatus.Draft or QuotationStatus.Sent))
        {
            return BadRequest(new { error = $"A {quotation.Status} quotation can no longer be edited." });
        }
        if (request.Lines.Count == 0) return BadRequest(new { error = "A quotation needs at least one line." });
        if (string.IsNullOrWhiteSpace(request.ProjectCode)) return BadRequest(new { error = "A project code is required on every quotation." });
        if (request.DiscountPct is < 0 or > 100) return BadRequest(new { error = "Discount must be between 0 and 100%." });

        var customer = request.CustomerId is null ? null : await db.Customers.FindAsync([request.CustomerId], ct);
        var (discountPct, isManualDiscount, quantityRules, promoRules) = await ResolvePricingAsync(quotation.BranchId, customer, request.DiscountPct, ct);

        if (request.Lines.Any(l => l.ManualUnitPrice is not null))
        {
            var priceError = await ValidatePriceOverrideAsync(quotation.BranchId, request.PriceOverrideApprovalRequestId, ct);
            if (priceError is not null) return BadRequest(new { error = priceError });
        }

        var linesResult = await BuildLines(request.Lines, customer, discountPct, isManualDiscount, quantityRules, promoRules, ct);
        if (linesResult.Error is not null) return BadRequest(new { error = linesResult.Error });

        var before = new { quotation.ProjectCode, quotation.CustomerReference, quotation.DiscountPct, quotation.GrandTotal };

        // Release the old lines' hold and re-reserve against the new lines — simplest correct way to
        // land on the right Reserved total whether the edit grew, shrank, or just re-priced the cart.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await reservations.ReleaseAsync(quotation.BranchId, quotation.Lines.Select(l => (l.ProductId, l.Qty)), ct);
        var reserveError = await ReserveOrConflict(quotation.BranchId, linesResult.Lines!, ct);
        if (reserveError is not null) { await tx.RollbackAsync(ct); return reserveError!; }

        db.QuotationLines.RemoveRange(quotation.Lines);
        quotation.Lines.Clear();
        quotation.CustomerId = request.CustomerId;
        quotation.ValidUntil = request.ValidUntil ?? quotation.ValidUntil;
        quotation.Notes = request.Notes;
        quotation.ProjectCode = request.ProjectCode.Trim();
        quotation.CustomerReference = request.CustomerReference?.Trim() ?? "";
        ApplyLines(quotation, linesResult.Lines!, discountPct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await audit.LogAsync("orders", "QUOTATION_UPDATED", id.ToString(), userId: cashierId, branchId: quotation.BranchId,
            oldValue: before, newValue: new { quotation.ProjectCode, quotation.CustomerReference, quotation.DiscountPct, quotation.GrandTotal }, cancellationToken: ct);

        var updated = await Query().FirstAsync(q => q.Id == id, ct);
        return Ok(Map(updated));
    }

    [HttpDelete("{id:int}")]
    [RequireModule("/operate/orders", PermissionAction.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var quotation = await Query().FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quotation is null) return NotFound();
        // Soft-cancel, not a hard delete: the row stays for audit/history (matches Voided orders),
        // it's just excluded from active work. A quotation already turned into a real order can't be
        // un-converted from here — cancel the resulting order instead.
        if (quotation.Status == QuotationStatus.Converted)
        {
            return BadRequest(new { error = "This quotation was already converted to an order — cancel the order instead." });
        }
        if (quotation.Status == QuotationStatus.Cancelled) return NoContent();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await reservations.ReleaseAsync(quotation.BranchId, quotation.Lines.Select(l => (l.ProductId, l.Qty)), ct);
        quotation.Status = QuotationStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await audit.LogAsync("orders", "QUOTATION_CANCELLED", id.ToString(), userId: cashierId, branchId: quotation.BranchId, cancellationToken: ct);
        return NoContent();
    }

    [HttpPut("{id:int}/send")]
    [RequireModule("/operate/orders", PermissionAction.Edit)]
    public Task<ActionResult<QuotationDto>> Send(int id, CancellationToken ct) => Transition(id, QuotationStatus.Draft, QuotationStatus.Sent, "QUOTATION_SENT", ct);

    [HttpPut("{id:int}/accept")]
    [RequireModule("/operate/orders", PermissionAction.Edit)]
    public Task<ActionResult<QuotationDto>> Accept(int id, CancellationToken ct) => Transition(id, QuotationStatus.Sent, QuotationStatus.Accepted, "QUOTATION_ACCEPTED", ct);

    [HttpPut("{id:int}/reject")]
    [RequireModule("/operate/orders", PermissionAction.Edit)]
    public Task<ActionResult<QuotationDto>> Reject(int id, CancellationToken ct) => Transition(id, QuotationStatus.Sent, QuotationStatus.Rejected, "QUOTATION_REJECTED", ct, releaseStock: true);

    [HttpPost("{id:int}/convert")]
    [RequireModule("/operate/orders", PermissionAction.Create)]
    public async Task<ActionResult<OrderDto>> Convert(int id, CancellationToken ct)
    {
        var quotation = await Query().FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quotation is null) return NotFound();
        if (quotation.Status is not (QuotationStatus.Sent or QuotationStatus.Accepted))
        {
            return BadRequest(new { error = $"Cannot convert a quotation in {quotation.Status} status." });
        }

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var order = new Order
        {
            OrderNo = $"ORD-{DateTime.UtcNow:yyyy}-{await db.Orders.CountAsync(ct) + 1:D4}",
            BranchId = quotation.BranchId, CashierUserId = cashierId, CustomerId = quotation.CustomerId,
            Type = OrderType.Quotation, Status = OrderStatus.Pending, PaymentStatus = PaymentStatus.Unpaid,
            SubTotal = quotation.SubTotal, DiscountTotal = quotation.DiscountTotal, VatTotal = quotation.VatTotal,
            GrandTotal = quotation.GrandTotal, Notes = quotation.Notes,
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in quotation.Lines)
        {
            // double cast: same Sqlite decimal-parameter-in-WHERE-comparison gotcha as
            // OrdersController.Checkout's stock deduction — see the comment there / docs/TESTING.md.
            // First release whatever hold this quotation's own line might be sitting on — a no-op if
            // Create/Update never got to reserve it (e.g. the branch hadn't stocked this product yet
            // at the time) — then deduct exactly like a normal checkout sale, with the same atomic
            // (OnHand - Reserved) >= qty guard. Releasing first (rather than combining into one
            // statement assuming Reserved already covers qty) keeps this correct whether or not this
            // quotation actually held a reservation for the line.
            var qty = (double)line.Qty;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET Reserved = Reserved - {qty} WHERE ProductId = {line.ProductId} AND BranchId = {quotation.BranchId} AND Reserved >= {qty}",
                ct);
            var rowsAffected = await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET OnHand = OnHand - {qty} WHERE ProductId = {line.ProductId} AND BranchId = {quotation.BranchId} AND (OnHand - Reserved) >= {qty}",
                ct);
            if (rowsAffected == 0)
            {
                return BadRequest(new { error = $"Insufficient stock for {line.Product?.Sku}." });
            }
            // Quotation lines are always priced in stock UOM (the quotation builder has no UOM
            // selector), so selling qty and stock qty are the same number here.
            order.Lines.Add(new OrderLine
            {
                ProductId = line.ProductId, Qty = line.Qty, Uom = line.Product?.StockUom ?? "",
                StockQty = line.Qty, UnitPrice = line.UnitPrice,
                DiscountPct = line.DiscountPct, VatRate = line.VatRate, LineTotal = line.LineTotal,
            });
        }

        db.Orders.Add(order);
        quotation.Status = QuotationStatus.Converted;
        quotation.ConvertedOrder = order;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("orders", "QUOTATION_CONVERTED", id.ToString(), userId: cashierId, branchId: order.BranchId, newValue: new { order.OrderNo }, cancellationToken: ct);

        var created = await db.Orders.Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Customer)
            .Include(o => o.Lines).ThenInclude(l => l.Product).Include(o => o.Payments).Include(o => o.Fees)
            .FirstAsync(o => o.Id == order.Id, ct);
        return Ok(OrdersController.MapOrder(created));
    }

    private async Task<ActionResult<QuotationDto>> Transition(int id, QuotationStatus from, QuotationStatus to, string auditEvent, CancellationToken ct, bool releaseStock = false)
    {
        var quotation = await Query().FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quotation is null) return NotFound();
        if (quotation.Status != from) return BadRequest(new { error = $"Quotation must be {from} to move to {to} (currently {quotation.Status})." });

        if (releaseStock)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await reservations.ReleaseAsync(quotation.BranchId, quotation.Lines.Select(l => (l.ProductId, l.Qty)), ct);
            quotation.Status = to;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        else
        {
            quotation.Status = to;
            await db.SaveChangesAsync(ct);
        }
        await audit.LogAsync("orders", auditEvent, id.ToString(), cancellationToken: ct);
        return Ok(Map(quotation));
    }

    // A quotation stops holding stock the moment it's no longer actionable — Draft/Sent are the only
    // statuses a reservation lives through.
    private async Task ExpireStale(CancellationToken ct)
    {
        var stale = await db.Quotations.Include(q => q.Lines)
            .Where(q => q.Status == QuotationStatus.Sent && q.ValidUntil < DateTime.UtcNow).ToListAsync(ct);
        if (stale.Count == 0) return;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var q in stale)
        {
            await reservations.ReleaseAsync(q.BranchId, q.Lines.Select(l => (l.ProductId, l.Qty)), ct);
            q.Status = QuotationStatus.Expired;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    // Shared by Create/Update: reserves every line's Qty at the branch, or returns a ready-to-return
    // 400 naming the first product that doesn't have enough available (OnHand - Reserved) stock. The
    // caller is expected to already be inside a transaction and roll it back when this returns non-null.
    private async Task<ActionResult<QuotationDto>?> ReserveOrConflict(int branchId, IEnumerable<QuotationLine> lines, CancellationToken ct)
    {
        var failedProductId = await reservations.ReserveAsync(branchId, lines.Select(l => (l.ProductId, l.Qty)), ct);
        if (failedProductId is null) return null;
        var sku = (await db.Products.FindAsync([failedProductId], ct))?.Sku ?? failedProductId.ToString();
        return BadRequest(new { error = $"Insufficient stock for {sku}." });
    }

    private IQueryable<Quotation> Query() => db.Quotations
        .Include(q => q.Customer).Include(q => q.CreatedBy).Include(q => q.ConvertedOrder)
        .Include(q => q.Lines).ThenInclude(l => l.Product);

    // BRD §5.1/§6.2/§7, mirroring OrdersController.Checkout: the contractor rate comes only from an
    // actual active "Trade Tier" pricing rule (no rule configured means no automatic discount), and a
    // manual DiscountPct override (typed on the quotation form) always wins over it. Quantity and
    // Promotional rules are returned separately since they apply per-line (by SKU + qty / date
    // window), not as a single blanket rate. IsManualDiscount tells BuildLines whether DiscountPct
    // came from an explicit human choice (never suppressed) or the automatic contractor rate
    // (suppressed once a line prices off a real segment list price, to avoid double-dipping).
    private async Task<(decimal DiscountPct, bool IsManualDiscount, List<PricingRule> QuantityRules, List<PricingRule> PromoRules)> ResolvePricingAsync(
        int branchId, Customer? customer, decimal? manualOverride, CancellationToken ct)
    {
        var activePricingRules = await db.PricingRules
            .Where(r => r.Status == PricingRuleStatus.Active
                && (r.BranchId == null || r.BranchId == branchId)
                && (r.ValidFrom == null || r.ValidFrom <= DateTime.UtcNow)
                && (r.ValidUntil == null || r.ValidUntil >= DateTime.UtcNow))
            .ToListAsync(ct);
        var tradeTierRule = customer?.Type == CustomerType.Contractor
            ? activePricingRules.Where(r => r.Type == "Trade Tier")
                .OrderByDescending(r => r.BranchId != null).ThenByDescending(r => r.Priority).FirstOrDefault()
            : null;
        var contractorPct = tradeTierRule?.Value ?? 0m;
        var quantityRules = activePricingRules.Where(r => r.Type == "Quantity" && r.MinQuantity is not null).ToList();
        var promoRules = activePricingRules.Where(r => r.Type == "Promotional").ToList();
        return (manualOverride ?? contractorPct, manualOverride is not null, quantityRules, promoRules);
    }

    // BRD §7 (CR-039), mirroring OrdersController.Checkout's identical gate: an absolute per-line
    // price override on a quotation needs the same authorization as one at the till.
    private async Task<string?> ValidatePriceOverrideAsync(int branchId, int? approvalRequestId, CancellationToken ct)
    {
        var canOverridePrice = string.Equals(User.FindFirst("posCeiling:canOverrideItemPrice")?.Value, "True", StringComparison.OrdinalIgnoreCase);
        if (canOverridePrice) return null;
        var hasApproval = approvalRequestId is int id && await db.ApprovalRequests.AnyAsync(a =>
            a.Id == id && a.Type == ApprovalType.PriceOverride && a.Status == ApprovalStatus.Approved && a.BranchId == branchId, ct);
        return hasApproval ? null : "Overriding an item's price requires supervisor approval. Request approval before checkout.";
    }

    // Shared by Create and Update: resolves each line's product, prices it at the customer's assigned
    // price list (BRD §7 CR-038 — falls back to Retail SellingPrice when no segment override is
    // configured), and applies the larger of the quotation's blanket discount / matching per-SKU
    // Quantity rule / matching Promotional rule — same "larger of, doesn't stack" behavior as
    // OrdersController.Checkout. A manual per-line price override (CR-039) replaces the resolved
    // price entirely, exempt from further discount, exactly like checkout. Returns an error string
    // instead of throwing so both callers can turn it into a 400.
    private async Task<(List<QuotationLine>? Lines, string? Error)> BuildLines(
        List<CartLineInput> requestLines, Customer? customer, decimal discountPct, bool isManualDiscount,
        List<PricingRule> quantityRules, List<PricingRule> promoRules, CancellationToken ct)
    {
        var lines = new List<QuotationLine>();
        foreach (var line in requestLines)
        {
            var product = await db.Products.FindAsync([line.ProductId], ct);
            if (product is null) return (null, $"Unknown product {line.ProductId}.");

            // BRD §7 (CR-038): quote at the customer's assigned price list — a Contractor/Wholesale/
            // Project customer's formal quotation must match what checkout would actually charge them,
            // not silently revert to Retail SellingPrice.
            var listPrice = product.SellingPrice;
            var listPriceApplied = false;
            if (customer is not null)
            {
                var segmentPrice = customer.PriceListType switch
                {
                    PriceListType.Contractor => product.ContractorPrice,
                    PriceListType.Wholesale => product.WholesalePrice,
                    PriceListType.Project => product.ProjectPrice,
                    _ => null,
                };
                if (segmentPrice is not null) { listPrice = segmentPrice.Value; listPriceApplied = true; }
            }

            if (line.ManualUnitPrice is <= 0) return (null, $"Manual price override for {product.Sku} must be positive.");
            var manualPriceOverride = line.ManualUnitPrice is not null;
            var unitPrice = manualPriceOverride ? line.ManualUnitPrice!.Value : listPrice;

            // Quotation lines are always priced/quantified in stock UOM (no UOM selector on the
            // quotation builder), so line.Qty is directly comparable to MinQuantity.
            var quantityPct = quantityRules
                .Where(r => (r.Sku == null || string.Equals(r.Sku, product.Sku, StringComparison.OrdinalIgnoreCase)) && line.Qty >= r.MinQuantity)
                .Select(r => r.Value).DefaultIfEmpty(0m).Max();
            // BRD §7 (CR-040): Promotional rules auto-apply within their date window, in the same
            // "larger of" group as everything else — never stacked on top.
            var promoPct = promoRules
                .Where(r => r.Sku == null || string.Equals(r.Sku, product.Sku, StringComparison.OrdinalIgnoreCase))
                .Select(r => r.Value).DefaultIfEmpty(0m).Max();
            // Once a real segment list price was actually used, the automatic contractor trade %
            // would double-dip on top of an already-negotiated price (same suppression as checkout) —
            // but an explicit DiscountPct the user typed on the quotation form always still applies.
            var effectiveDiscountPct = listPriceApplied && !isManualDiscount ? 0m : discountPct;
            var lineDiscountPct = manualPriceOverride ? 0m : Math.Max(Math.Max(effectiveDiscountPct, quantityPct), promoPct);

            var lineTotal = Math.Round(line.Qty * unitPrice * (1 - lineDiscountPct / 100), 2);
            lines.Add(new QuotationLine
            {
                ProductId = product.Id, Qty = line.Qty, UnitPrice = unitPrice,
                DiscountPct = lineDiscountPct, VatRate = product.VatRate, LineTotal = lineTotal,
            });
        }
        return (lines, null);
    }

    private static void ApplyLines(Quotation quotation, List<QuotationLine> lines, decimal discountPct)
    {
        foreach (var line in lines) quotation.Lines.Add(line);
        quotation.DiscountPct = discountPct;
        quotation.SubTotal = quotation.Lines.Sum(l => l.Qty * l.UnitPrice);
        quotation.DiscountTotal = quotation.SubTotal - quotation.Lines.Sum(l => l.LineTotal);
        quotation.VatTotal = quotation.Lines.Sum(l => l.LineTotal * l.VatRate / 100);
        quotation.GrandTotal = Math.Round(quotation.Lines.Sum(l => l.LineTotal) + quotation.VatTotal, 2);
    }

    private static QuotationDto Map(Quotation q) => new(
        q.Id, q.QuoteNo, q.BranchId, q.CustomerId, q.Customer?.NameEn ?? "Walk-in Customer", q.CreatedBy?.Name ?? "",
        q.Status.ToString(), q.ValidUntil, q.SubTotal, q.DiscountTotal, q.VatTotal, q.GrandTotal, q.Notes,
        q.ConvertedOrderId, q.ConvertedOrder?.OrderNo, q.CreatedAt,
        q.Lines.Select(l => new QuotationLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.UnitPrice, l.DiscountPct, l.VatRate, l.LineTotal)).ToList(),
        q.ProjectCode, q.CustomerReference, q.DiscountPct);
}
