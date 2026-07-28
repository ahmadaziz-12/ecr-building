using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Shift Report (BRD §11) — the period view of till reconciliation. The POS already prints a single
// shift's X/Z report (CashierShiftsController); this is the other half of the same story: every
// shift over a date window side by side, so an over/short pattern on one terminal or one cashier is
// visible rather than buried in a stack of printed Z-reports.
//
// Each row drills into that shift's cash movements — the itemized in/out events behind the
// CashIn/CashOut totals that ExpectedCash is built from.

public record ShiftCashMovementRow(
    DateTime At, string Direction, decimal Amount, string Reason, string? By);

public record ShiftReportRow(
    int Id, DateTime OpenedAt, DateTime? ClosedAt, decimal DurationHours, string Terminal, string Branch,
    string Cashier, string Status,
    decimal OpeningFloat, decimal CashSales, decimal CashIn, decimal CashOut, decimal ExpectedCash,
    decimal? CountedCash, decimal Variance, string CashResult,
    int Orders, decimal GrossSales, decimal Discounts, decimal Vat, decimal NetTakings,
    decimal NonCashTakings, decimal ItemsSold, decimal AvgBasket,
    int VoidedOrders, decimal VoidedValue, int Refunds, decimal RefundValue,
    int CashMovements, IReadOnlyList<ShiftCashMovementRow> Items);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class ShiftReportController(AppDbContext db) : ReportControllerBase
{
    [HttpGet("shift-report")]
    public async Task<ActionResult<List<ShiftReportRow>>> ShiftReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? userId, [FromQuery] int[]? terminalId,
        [FromQuery] string[]? status, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);

        // Windowed on OpenedAt: a shift belongs to the day it was opened on, which is how a cashier
        // and an auditor both read it, even when a late shift closes after midnight.
        var shifts = await db.CashierShifts
            .Include(s => s.Terminal).ThenInclude(x => x!.Branch)
            .Include(s => s.Cashier)
            .Where(s => s.OpenedAt >= f && s.OpenedAt < t)
            .ToListAsync(ct);

        shifts = shifts
            .Where(s => ReportFilters.Matches(branchId, s.Terminal?.BranchId)
                && ReportFilters.Matches(userId, s.CashierUserId)
                && ReportFilters.Matches(terminalId, s.TerminalId)
                && ReportFilters.Matches(status, s.Status.ToString()))
            .ToList();
        if (shifts.Count == 0) return Ok(new List<ShiftReportRow>());

        // One pass over the orders that could belong to any of these shifts, then matched in memory —
        // a shift's order set is a per-shift time window on a terminal, which no single SQL predicate
        // expresses without one query per shift.
        // Nullable element type so `Contains` binds against Order.TerminalId (int?) and translates.
        var terminalIds = shifts.Select(s => (int?)s.TerminalId).Distinct().ToList();
        var earliest = shifts.Min(s => s.OpenedAt);
        var latest = shifts.Max(s => s.ClosedAt ?? DateTime.UtcNow);
        var orders = await db.Orders
            .Include(o => o.Payments).Include(o => o.Lines)
            .Where(o => o.TerminalId != null && terminalIds.Contains(o.TerminalId)
                && o.CreatedAt >= earliest && o.CreatedAt <= latest)
            .ToListAsync(ct);

        var shiftIds = shifts.Select(s => s.Id).ToList();
        var movements = await db.CashMovements
            .Include(m => m.CreatedByUser)
            .Where(m => shiftIds.Contains(m.CashierShiftId))
            .OrderBy(m => m.CreatedAt)
            .ToListAsync(ct);

        // Refunds can't be tied to a terminal — Return carries no TerminalId — so they are attributed
        // to the shift whose cashier approved them inside its own window. A refund approved by someone
        // else (a supervisor on another till) belongs to that person's shift, not this one.
        var returns = await db.Returns
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= earliest && r.CreatedAt <= latest)
            .Select(r => new { r.ApprovedByUserId, r.CreatedAt, r.NetCashback })
            .ToListAsync(ct);

        var rows = shifts.Select(s =>
        {
            var windowEnd = s.ClosedAt ?? DateTime.UtcNow;
            var shiftOrders = orders
                .Where(o => o.TerminalId == s.TerminalId && o.CreatedAt >= s.OpenedAt && o.CreatedAt <= windowEnd)
                .ToList();
            var live = shiftOrders.Where(o => o.Status != OrderStatus.Voided).ToList();
            var voided = shiftOrders.Where(o => o.Status == OrderStatus.Voided).ToList();
            var payments = live.SelectMany(o => o.Payments).ToList();

            // CashSales is only frozen onto the row when the shift is closed — while it is open the
            // stored value is still 0, so an open shift must derive it from the till's paid cash
            // orders or its expected drawer understates the whole shift's takings (the same rule
            // CashierShiftsController.LiveCashSalesAsync applies to the POS's own screens).
            var cashSales = s.Status == CashierShiftStatus.Open
                ? shiftOrders
                    .Where(o => o.PaymentStatus == Domain.Entities.PaymentStatus.Paid)
                    .SelectMany(o => o.Payments)
                    .Where(p => p.Method == Domain.Entities.PaymentMethod.Cash)
                    .Sum(p => p.Amount)
                : s.CashSales;
            var expected = s.OpeningFloat + cashSales + s.CashIn - s.CashOut;
            var variance = s.CountedCash is null ? 0 : s.CountedCash.Value - expected;

            var shiftMovements = movements.Where(m => m.CashierShiftId == s.Id).ToList();
            var refunds = returns
                .Where(r => r.ApprovedByUserId == s.CashierUserId && r.CreatedAt >= s.OpenedAt && r.CreatedAt <= windowEnd)
                .ToList();

            return new ShiftReportRow(
                s.Id, s.OpenedAt, s.ClosedAt,
                Math.Round((decimal)(windowEnd - s.OpenedAt).TotalHours, 2),
                s.Terminal?.Name ?? $"Terminal {s.TerminalId}", s.Terminal?.Branch?.NameEn ?? "",
                s.Cashier?.Name ?? $"User {s.CashierUserId}", s.Status.ToString(),
                Math.Round(s.OpeningFloat, 2), Math.Round(cashSales, 2),
                Math.Round(s.CashIn, 2), Math.Round(s.CashOut, 2), Math.Round(expected, 2),
                s.CountedCash is null ? null : Math.Round(s.CountedCash.Value, 2),
                Math.Round(variance, 2),
                // An uncounted drawer is not a balanced one — reporting 0.00 variance for a shift
                // nobody has counted yet would read as "reconciled".
                s.CountedCash is null ? "Uncounted" : variance == 0 ? "Balanced" : variance > 0 ? "Overage" : "Shortage",
                live.Count, Math.Round(live.Sum(o => o.SubTotal), 2),
                Math.Round(live.Sum(o => o.DiscountTotal), 2), Math.Round(live.Sum(o => o.VatTotal), 2),
                Math.Round(live.Sum(o => o.GrandTotal), 2),
                Math.Round(payments.Where(p => p.Method != Domain.Entities.PaymentMethod.Cash).Sum(p => p.Amount), 2),
                Math.Round(live.SelectMany(o => o.Lines).Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty), 2),
                live.Count == 0 ? 0 : Math.Round(live.Sum(o => o.GrandTotal) / live.Count, 2),
                voided.Count, Math.Round(voided.Sum(o => o.GrandTotal), 2),
                refunds.Count, Math.Round(refunds.Sum(r => r.NetCashback), 2),
                shiftMovements.Count,
                shiftMovements.Select(m => new ShiftCashMovementRow(
                    m.CreatedAt, m.Direction.ToString(), Math.Round(m.Amount, 2), m.Reason,
                    m.CreatedByUser?.Name)).ToList());
        })
        .OrderByDescending(r => r.OpenedAt)
        .ToList();

        return Ok(rows);
    }
}
