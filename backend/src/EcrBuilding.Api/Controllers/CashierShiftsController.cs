using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/pos/cashier-shifts")]
[Authorize]
[RequireModule("/operate/cashier-shift", PermissionAction.View)]
public class CashierShiftsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    // CashSales is only frozen onto the row at close time; while a shift is OPEN the stored value
    // is still 0, so every mid-shift surface (list KPIs, cash-movement response, X-Report) must
    // derive it live from the terminal's paid cash orders or the expected-drawer figure understates
    // reality by the whole shift's takings.
    private Task<decimal> LiveCashSalesAsync(CashierShift shift, CancellationToken ct)
    {
        var windowEnd = shift.ClosedAt ?? DateTime.UtcNow;
        return db.Orders
            .Where(o => o.TerminalId == shift.TerminalId && o.CreatedAt >= shift.OpenedAt && o.CreatedAt <= windowEnd
                && o.PaymentStatus == Domain.Entities.PaymentStatus.Paid)
            .SelectMany(o => o.Payments).Where(p => p.Method == Domain.Entities.PaymentMethod.Cash)
            .SumAsync(p => p.Amount, ct);
    }

    [HttpGet]
    public async Task<ActionResult<List<CashierShiftDto>>> List(CancellationToken ct)
    {
        var shifts = await db.CashierShifts.Include(s => s.Terminal).Include(s => s.Cashier)
            .OrderByDescending(s => s.OpenedAt).ToListAsync(ct);
        var dtos = new List<CashierShiftDto>(shifts.Count);
        foreach (var shift in shifts)
        {
            dtos.Add(shift.Status == CashierShiftStatus.Open ? Map(shift, await LiveCashSalesAsync(shift, ct)) : Map(shift));
        }
        return Ok(dtos);
    }

    // Every till this caller may open a shift on. Branch-scoped users see their own branch's tills;
    // an unscoped (HQ) user sees all of them, ordered so the busy ones sort last.
    [HttpGet("terminals")]
    public async Task<ActionResult<List<ShiftTerminalDto>>> Terminals(CancellationToken ct)
    {
        var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var caller = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == callerId, ct);
        // Same BRD §10.1 ladder OrdersController's void-authorization check uses: Supervisor and up
        // may open a shift on behalf of another cashier (Open below auto-attributes to whoever the
        // terminal is assigned to). A plain Cashier/Senior Cashier only ever opens their OWN shift, so
        // a till assigned to someone else is hidden from their picker entirely — showing it let them
        // pick it, fill in a float, and have the shift silently open under a stranger's name.
        var canOpenForOthers = caller?.Role is { CanVoidTransactions: true };

        var query = db.Terminals.Include(t => t.Branch).Include(t => t.Operator).AsQueryable();
        if (this.GetScopedBranchId() is int scopedBranchId) query = query.Where(t => t.BranchId == scopedBranchId);
        var terminals = await query.OrderBy(t => t.Branch!.NameEn).ThenBy(t => t.Code).ToListAsync(ct);
        if (!canOpenForOthers)
        {
            terminals = terminals.Where(t => t.OperatorUserId is null || t.OperatorUserId == callerId).ToList();
        }

        // GroupBy, not ToDictionary: the Open endpoint below rejects a second concurrent shift, but a
        // duplicate left by older data would turn this picker into a 500 instead of a list.
        var openShifts = (await db.CashierShifts.Include(s => s.Cashier)
                .Where(s => s.Status == CashierShiftStatus.Open).ToListAsync(ct))
            .GroupBy(s => s.TerminalId)
            .ToDictionary(g => g.Key, g => g.First().Cashier?.Name ?? "another cashier");

        return Ok(terminals.Select(t => new ShiftTerminalDto(
            t.Id, t.Code, t.Name, t.BranchId, t.Branch?.NameEn ?? "—", t.Status.ToString(),
            openShifts.TryGetValue(t.Id, out var cashier) ? cashier : null,
            t.OperatorUserId, t.Operator?.Name)).ToList());
    }

    [HttpPost("open")]
    [RequireModule("/operate/cashier-shift", PermissionAction.Create)]
    public async Task<ActionResult<CashierShiftDto>> Open(OpenShiftRequest request, CancellationToken ct)
    {
        var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var terminal = await db.Terminals.FirstOrDefaultAsync(t => t.Id == request.TerminalId, ct);
        if (terminal is null)
        {
            return BadRequest(new { error = "Unknown terminal." });
        }
        // A terminal with an assigned cashier (Network > Terminals > Assign Cashier) always opens its
        // shift under THAT cashier — even when a Supervisor/Store Manager/System Admin is the one who
        // clicks Open Shift on their behalf — so drawer-cash accountability lands on whoever actually
        // works the till, never on whichever manager happened to press the button. An unassigned
        // terminal still opens under the caller (self-service, the common case).
        var cashierId = terminal.OperatorUserId ?? callerId;
        if (await db.CashierShifts.AnyAsync(s => s.TerminalId == request.TerminalId && s.Status == CashierShiftStatus.Open, ct))
        {
            return BadRequest(new { error = "This terminal already has an open shift." });
        }
        // One cashier, one terminal at a time — unlike AssignCashier (an admin re-pointing a terminal
        // record), this is the cashier's own drawer float/cash tally, so a second concurrent shift is
        // rejected rather than silently moved: auto-closing the old one would abandon its cash count.
        var existingOpenShift = await db.CashierShifts.Include(s => s.Terminal)
            .FirstOrDefaultAsync(s => s.CashierUserId == cashierId && s.Status == CashierShiftStatus.Open, ct);
        if (existingOpenShift is not null)
        {
            var whose = cashierId == callerId ? "You already have" : "This cashier already has";
            return BadRequest(new { error = $"{whose} an open shift on {existingOpenShift.Terminal?.Name ?? "another terminal"} — close it before opening a new one." });
        }

        var shift = new CashierShift { TerminalId = request.TerminalId, CashierUserId = cashierId, OpeningFloat = request.OpeningFloat };
        db.CashierShifts.Add(shift);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", "SHIFT_OPENED", shift.Id.ToString(), userId: cashierId, cancellationToken: ct);

        await db.Entry(shift).Reference(s => s.Terminal).LoadAsync(ct);
        await db.Entry(shift).Reference(s => s.Cashier).LoadAsync(ct);
        return Ok(Map(shift));
    }

    [HttpPut("{id:int}/cash-movement")]
    [RequireModule("/operate/cashier-shift", PermissionAction.Edit)]
    public async Task<ActionResult<CashierShiftDto>> CashMovement(int id, [FromQuery] string direction, CashMovementRequest request, CancellationToken ct)
    {
        var shift = await db.CashierShifts.Include(s => s.Terminal).Include(s => s.Cashier).FirstOrDefaultAsync(s => s.Id == id, ct);
        if (shift is null) return NotFound();
        if (shift.Status != CashierShiftStatus.Open) return BadRequest(new { error = "Shift is not open." });

        var isIn = direction.Equals("in", StringComparison.OrdinalIgnoreCase);
        if (isIn) shift.CashIn += request.Amount; else shift.CashOut += request.Amount;

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        // CashIn/CashOut above stay the running totals ExpectedCash already reads — this itemizes
        // each individual event behind them so a till reconciliation can drill into WHAT made up
        // that total, not just the aggregate (the same gap StockMovement closed for stock counts).
        db.CashMovements.Add(new CashMovement
        {
            CashierShiftId = id, Direction = isIn ? CashMovementDirection.In : CashMovementDirection.Out,
            Amount = request.Amount, Reason = request.Reason, CreatedByUserId = userId,
        });

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", isIn ? "SHIFT_CASH_IN" : "SHIFT_CASH_OUT",
            id.ToString(), reason: request.Reason, cancellationToken: ct);
        return Ok(Map(shift, await LiveCashSalesAsync(shift, ct)));
    }

    [HttpGet("{id:int}/movements")]
    public async Task<ActionResult<List<CashMovementDto>>> Movements(int id, CancellationToken ct)
    {
        var rows = await db.CashMovements.Include(m => m.CreatedByUser).Where(m => m.CashierShiftId == id)
            .OrderBy(m => m.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(m => new CashMovementDto(
            m.Id, m.Direction.ToString(), m.Amount, m.Reason, m.CreatedAt, m.CreatedByUser?.Name)).ToList());
    }

    [HttpPut("{id:int}/close")]
    [RequireModule("/operate/cashier-shift", PermissionAction.Edit)]
    public async Task<ActionResult<CashierShiftDto>> Close(int id, CloseShiftRequest request, CancellationToken ct)
    {
        var shift = await db.CashierShifts.Include(s => s.Terminal).Include(s => s.Cashier).FirstOrDefaultAsync(s => s.Id == id, ct);
        if (shift is null) return NotFound();

        var paidOrders = await db.Orders.Where(o => o.TerminalId == shift.TerminalId && o.CreatedAt >= shift.OpenedAt && o.PaymentStatus == Domain.Entities.PaymentStatus.Paid)
            .SelectMany(o => o.Payments).Where(p => p.Method == Domain.Entities.PaymentMethod.Cash).SumAsync(p => p.Amount, ct);
        shift.CashSales = paidOrders;
        shift.CountedCash = request.CountedCash;
        shift.ClosedAt = DateTime.UtcNow;
        shift.Status = Math.Abs((shift.CountedCash ?? 0) - shift.ExpectedCash) > 20 ? CashierShiftStatus.NeedsReview : CashierShiftStatus.Closed;

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", "SHIFT_CLOSED", id.ToString(), newValue: new { shift.ExpectedCash, shift.CountedCash, shift.Variance }, cancellationToken: ct);
        return Ok(Map(shift));
    }

    [HttpGet("{id:int}/report")]
    public async Task<ActionResult<CashierShiftReportDto>> Report(int id, [FromQuery] string type, CancellationToken ct)
    {
        if (type is not ("X" or "Z")) return BadRequest(new { error = "Report type must be X or Z." });

        var shift = await db.CashierShifts.Include(s => s.Terminal).Include(s => s.Cashier).FirstOrDefaultAsync(s => s.Id == id, ct);
        if (shift is null) return NotFound();
        if (type == "Z" && shift.Status == CashierShiftStatus.Open) return BadRequest(new { error = "Z-Report is only available once the shift is closed." });

        var windowEnd = shift.ClosedAt ?? DateTime.UtcNow;
        var orders = await db.Orders.Include(o => o.Payments)
            .Where(o => o.TerminalId == shift.TerminalId && o.CreatedAt >= shift.OpenedAt && o.CreatedAt <= windowEnd && o.PaymentStatus == Domain.Entities.PaymentStatus.Paid)
            .ToListAsync(ct);

        var breakdown = orders.SelectMany(o => o.Payments)
            .GroupBy(p => p.Method)
            .Select(g => new ShiftPaymentBreakdownDto(g.Key.ToString(), g.Sum(p => p.Amount), g.Count()))
            .OrderByDescending(b => b.Amount)
            .ToList();

        // An open shift's stored CashSales is still 0 (frozen only at close) — the X-Report's whole
        // purpose is the CURRENT expected drawer, so derive it from the same orders the breakdown uses.
        var cashSales = shift.Status == CashierShiftStatus.Open
            ? breakdown.Where(b => b.Method == nameof(Domain.Entities.PaymentMethod.Cash)).Sum(b => b.Amount)
            : shift.CashSales;
        var expectedCash = shift.OpeningFloat + cashSales + shift.CashIn - shift.CashOut;
        var variance = shift.CountedCash is null ? (decimal?)null : shift.CountedCash - expectedCash;

        return Ok(new CashierShiftReportDto(
            type, shift.Id, shift.Terminal?.Name ?? "", shift.Cashier?.Name ?? "", shift.OpenedAt, shift.ClosedAt, DateTime.UtcNow,
            shift.OpeningFloat, cashSales, shift.CashIn, shift.CashOut, expectedCash, shift.CountedCash, variance,
            orders.Count, breakdown));
    }

    // liveCashSales: pass the derived figure for OPEN shifts (stored CashSales is 0 until close);
    // omit for closed shifts, whose frozen value is authoritative.
    private static CashierShiftDto Map(CashierShift s, decimal? liveCashSales = null)
    {
        var cashSales = liveCashSales ?? s.CashSales;
        var expectedCash = s.OpeningFloat + cashSales + s.CashIn - s.CashOut;
        var variance = s.CountedCash is null ? (decimal?)null : s.CountedCash - expectedCash;
        return new(
            s.Id, s.TerminalId, s.Terminal?.Name ?? "", s.Cashier?.Name ?? "", s.OpenedAt, s.ClosedAt, s.OpeningFloat,
            cashSales, s.CashIn, s.CashOut, expectedCash, s.CountedCash, variance, s.Status.ToString(), s.CashierUserId);
    }
}

[ApiController]
[Route("api/finance/pricing-rules")]
[Authorize]
[RequireModule("/finance/pricing", PermissionAction.View)]
public class PricingRulesController(AppDbContext db, IAuditService audit, IPermissionResolver permissionResolver) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<PricingRuleDto>>> List(CancellationToken ct)
    {
        var rules = await db.PricingRules.Include(r => r.Branch).OrderByDescending(r => r.Priority).ToListAsync(ct);
        return Ok(rules.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/finance/pricing", PermissionAction.Create)]
    public async Task<ActionResult<PricingRuleDto>> Create(UpsertPricingRuleRequest request, CancellationToken ct)
    {
        if (request.BranchId is not null && !await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }
        var rule = new PricingRule
        {
            Name = request.Name, Type = request.Type, BranchId = request.BranchId, Scope = request.Scope, Condition = request.Condition,
            Action = request.Action, Priority = request.Priority, ValidFrom = request.ValidFrom, ValidUntil = request.ValidUntil,
            Code = request.Code?.ToUpperInvariant(), DiscountType = Enum.Parse<RuleDiscountType>(request.DiscountType), Value = request.Value,
            MinQuantity = request.MinQuantity, Sku = request.Sku?.ToUpperInvariant(),
            PalletQty = request.PalletQty, BuyQty = request.BuyQty, FreeQty = request.FreeQty, MinCartTotal = request.MinCartTotal,
            // Every rule created through the UI needs a manager sign-off before it can discount a
            // sale or be redeemed as a coupon — seeded demo rules bypass this via the entity default.
            Status = PricingRuleStatus.PendingApproval,
            CreatedByUserId = int.Parse(User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier)!),
        };
        db.PricingRules.Add(rule);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "PRICING_RULE_CREATED", rule.Id.ToString(), newValue: request, cancellationToken: ct);
        if (rule.BranchId is not null) await db.Entry(rule).Reference(r => r.Branch).LoadAsync(ct);
        return Ok(Map(rule));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/finance/pricing", PermissionAction.Edit)]
    public async Task<ActionResult<PricingRuleDto>> UpdateStatus(int id, EcrBuilding.Application.Catalog.SetStatusRequest request, CancellationToken ct)
    {
        var rule = await db.PricingRules.Include(r => r.Branch).FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule is null) return NotFound();

        var newStatus = Enum.Parse<PricingRuleStatus>(request.Status);
        // A rule needing sign-off ("PendingApproval → Active") must be activated by someone other
        // than whoever created it — otherwise the "needs a manager sign-off" comment above is purely
        // decorative: the same user creates it and immediately activates their own discount/coupon.
        // Exception: a Full-access Finance user (e.g. Owner) already has standing authority to
        // approve anyone else's rule, so requiring a second such user to sign off their own is just
        // friction, not a real control — self-approval is allowed only at that access tier.
        if (rule.Status == PricingRuleStatus.PendingApproval && newStatus == PricingRuleStatus.Active && rule.CreatedByUserId is not null)
        {
            var userId = int.Parse(User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier)!);
            var canSelfApprove = await permissionResolver.HasAsync(userId, "/finance/pricing", PermissionAction.Approve, ct);
            if (userId == rule.CreatedByUserId && !canSelfApprove)
            {
                return BadRequest(new { error = "You cannot approve your own pricing rule — a different user must activate it." });
            }
        }

        rule.Status = newStatus;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", $"PRICING_RULE_{rule.Status.ToString().ToUpperInvariant()}", id.ToString(), cancellationToken: ct);
        return Ok(Map(rule));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/finance/pricing", PermissionAction.Edit)]
    public async Task<ActionResult<PricingRuleDto>> Update(int id, UpsertPricingRuleRequest request, CancellationToken ct)
    {
        var rule = await db.PricingRules.Include(r => r.Branch).FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule is null) return NotFound();
        if (request.BranchId is not null && !await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }

        var before = new { rule.Name, rule.Scope, rule.Condition, rule.Action, rule.Value, rule.Status };
        rule.Name = request.Name; rule.Type = request.Type; rule.BranchId = request.BranchId; rule.Scope = request.Scope;
        rule.Condition = request.Condition; rule.Action = request.Action; rule.Priority = request.Priority;
        rule.ValidFrom = request.ValidFrom; rule.ValidUntil = request.ValidUntil;
        rule.Code = request.Code?.ToUpperInvariant(); rule.DiscountType = Enum.Parse<RuleDiscountType>(request.DiscountType); rule.Value = request.Value;
        rule.MinQuantity = request.MinQuantity; rule.Sku = request.Sku?.ToUpperInvariant();
        rule.PalletQty = request.PalletQty; rule.BuyQty = request.BuyQty; rule.FreeQty = request.FreeQty; rule.MinCartTotal = request.MinCartTotal;
        // Editing a live rule's terms (discount %, threshold, code…) re-opens the same manager
        // sign-off the rule needed to go live in the first place — otherwise "Edit" would be a
        // silent side door around the self/cross-approval control on the status endpoint above.
        if (rule.Status == PricingRuleStatus.Active) rule.Status = PricingRuleStatus.PendingApproval;

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "PRICING_RULE_UPDATED", id.ToString(), oldValue: before, newValue: request, cancellationToken: ct);
        if (rule.BranchId is not null) await db.Entry(rule).Reference(r => r.Branch).LoadAsync(ct);
        return Ok(Map(rule));
    }

    [HttpDelete("{id:int}")]
    [RequireModule("/finance/pricing", PermissionAction.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var rule = await db.PricingRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule is null) return NotFound();
        // Safe as a hard delete, unlike most other entities in this app: nothing references a
        // PricingRule by id (OrderLine/QuotationLine only ever copy its Value onto DiscountPct at
        // the moment of sale), so removing it can't orphan a foreign key or corrupt sales history.
        db.PricingRules.Remove(rule);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "PRICING_RULE_DELETED", id.ToString(), oldValue: new { rule.Name, rule.Type, rule.Scope }, cancellationToken: ct);
        return NoContent();
    }

    private static PricingRuleDto Map(PricingRule r) => new(
        r.Id, r.Name, r.Type, r.Scope, r.Condition, r.Action, r.Priority, r.ValidUntil, r.Status.ToString(), r.Code, r.DiscountType.ToString(), r.Value,
        r.BranchId, r.Branch?.NameEn, r.MinQuantity, r.Sku, r.ValidFrom,
        r.PalletQty, r.BuyQty, r.FreeQty, r.MinCartTotal);
}

// Separate controller (no Finance-module gate) — any authenticated POS role needs to redeem a
// coupon at checkout, regardless of whether their role can manage pricing rules.
[ApiController]
[Route("api/finance/pricing-rules")]
[Authorize]
public class CouponsController(AppDbContext db) : ControllerBase
{
    [HttpGet("validate-coupon")]
    public async Task<ActionResult<ValidateCouponResponse>> ValidateCoupon([FromQuery] string code, CancellationToken ct)
    {
        var coupon = await db.PricingRules.FirstOrDefaultAsync(r => r.Code != null && r.Code.ToUpper() == code.ToUpper(), ct);
        if (coupon is null) return Ok(new ValidateCouponResponse(false, null, null, "Percentage", 0, "Coupon not found."));
        if (coupon.Status != PricingRuleStatus.Active) return Ok(new ValidateCouponResponse(false, coupon.Code, coupon.Name, coupon.DiscountType.ToString(), coupon.Value, "Coupon is not active."));
        if (coupon.ValidUntil is not null && coupon.ValidUntil < DateTime.UtcNow) return Ok(new ValidateCouponResponse(false, coupon.Code, coupon.Name, coupon.DiscountType.ToString(), coupon.Value, "Coupon has expired."));
        return Ok(new ValidateCouponResponse(true, coupon.Code, coupon.Name, coupon.DiscountType.ToString(), coupon.Value, null));
    }
}
