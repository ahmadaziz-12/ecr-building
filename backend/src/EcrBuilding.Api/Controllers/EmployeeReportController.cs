using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Employee Report — one row per staff account, covering what that person did on the system in the
// window: sales rung, discounts given, voids, returns approved, shifts worked and cash variance,
// plus their audit footprint. Row-level drill-down is their individual activity trail.
//
// Deliberately sourced from Users + transactions only — no HR module. Attendance, leave, contracts,
// departments and shifts are not read here, so the report keeps working unchanged if HRMS is never
// deployed. "Shifts" below means POS cashier shifts (open/close/cash count), which are a register
// concept, not an HR roster one.
//
// Same two filter conventions as every other report: exclusive to-plus-one-day date bound, and
// multi-valued list filters where empty means "no constraint".

public record EmployeeActivityRow(
    DateTime Date, string Kind, string Reference, string Detail, decimal? Amount, string? Branch, string Severity);

public record EmployeeReportRow(
    int UserId, string Name, string Email, string Role, string Branch, string Status,
    DateTime? LastLoginAt, DateTime? LastActivityAt,
    int Orders, decimal GrossSales, decimal Discounts, decimal Vat, decimal NetSales,
    decimal AvgBasket, decimal ItemsPerOrder, decimal DiscountRatePct,
    int VoidedOrders, decimal VoidedValue,
    int RefundsApproved, decimal RefundValue,
    int Shifts, decimal CashVariance,
    int AuditEvents, int CriticalEvents,
    IReadOnlyList<EmployeeActivityRow> Items);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class EmployeeReportController(AppDbContext db) : ReportControllerBase
{
    [HttpGet("employee-report")]
    public async Task<ActionResult<List<EmployeeReportRow>>> EmployeeReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? userId, [FromQuery] int[]? branchId, [FromQuery] int[]? roleId,
        [FromQuery] string[]? status, [FromQuery] int take = 200,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);

        var users = await db.Users.Include(u => u.Role).Include(u => u.Branch).ToListAsync(ct);
        users = users.Where(u =>
            ReportFilters.Matches(userId, u.Id)
            && ReportFilters.Matches(branchId, u.BranchId)
            && ReportFilters.Matches(roleId, u.RoleId)
            && ReportFilters.Matches(status, u.Status.ToString())).ToList();

        var ids = users.Select(u => u.Id).ToList();
        if (ids.Count == 0) return Ok(new List<EmployeeReportRow>());

        var orders = await db.Orders.Include(o => o.Lines).Include(o => o.Branch)
            .Where(o => ids.Contains(o.CashierUserId) && o.CreatedAt >= f && o.CreatedAt < t)
            .ToListAsync(ct);
        var refunds = await db.Returns.Include(r => r.Order).ThenInclude(o => o!.Branch)
            .Where(r => r.ApprovedByUserId != null && ids.Contains(r.ApprovedByUserId.Value)
                && r.CreatedAt >= f && r.CreatedAt < t)
            .ToListAsync(ct);
        var shifts = await db.CashierShifts
            .Where(s => ids.Contains(s.CashierUserId) && s.OpenedAt >= f && s.OpenedAt < t)
            .ToListAsync(ct);
        var auditLogs = await db.AuditLogs
            .Where(a => a.UserId != null && ids.Contains(a.UserId.Value) && a.CreatedAt >= f && a.CreatedAt < t)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync(ct);

        var rows = users.Select(u =>
        {
            var mine = orders.Where(o => o.CashierUserId == u.Id).ToList();
            // A voided sale is not revenue — the same rule ReportsController.CompletedOrders and the
            // dashboard both apply, so these figures reconcile against Sales Summary line for line.
            var completed = mine.Where(o => o.Status != OrderStatus.Voided).ToList();
            var voided = mine.Where(o => o.Status == OrderStatus.Voided).ToList();
            var myRefunds = refunds.Where(r => r.ApprovedByUserId == u.Id).ToList();
            var approvedRefunds = myRefunds.Where(r => r.Status == ReturnStatus.Completed).ToList();
            var myShifts = shifts.Where(s => s.CashierUserId == u.Id).ToList();
            var myAudit = auditLogs.Where(a => a.UserId == u.Id).ToList();

            var gross = completed.Sum(o => o.SubTotal);

            // The drill-down is the person's own timeline: every sale, void, refund approval and
            // shift close in one list, newest first, so a spike in the roll-up can be traced to the
            // transactions that produced it without leaving the report.
            var activity = completed.Select(o => new EmployeeActivityRow(
                    o.CreatedAt, "Sale", o.OrderNo, $"{o.Lines.Count} line(s) · {o.Status}",
                    Math.Round(o.GrandTotal, 2), o.Branch?.NameEn, "Info"))
                .Concat(voided.Select(o => new EmployeeActivityRow(
                    o.CreatedAt, "Void", o.OrderNo, "Order voided at register",
                    Math.Round(o.GrandTotal, 2), o.Branch?.NameEn, "Warning")))
                .Concat(myRefunds.Select(r => new EmployeeActivityRow(
                    r.CreatedAt, "Refund", r.ReturnNo, $"{r.Type} · {r.Status} · {r.Reason}",
                    Math.Round(r.NetCashback, 2), r.Order?.Branch?.NameEn, "Warning")))
                // Only closed shifts carry a counted-cash figure; an open one has nothing to
                // reconcile yet, so it contributes no variance rather than a misleading zero.
                .Concat(myShifts.Where(s => s.ClosedAt != null).Select(s => new EmployeeActivityRow(
                    s.ClosedAt!.Value, "Shift Close", s.Id.ToString(),
                    $"Expected {s.ExpectedCash:0.00} · counted {s.CountedCash ?? 0:0.00}",
                    Math.Round(s.Variance ?? 0, 2), null,
                    (s.Variance ?? 0) != 0 ? "Warning" : "Info")))
                .Concat(myAudit.Select(a => new EmployeeActivityRow(
                    a.CreatedAt, a.Module, a.Event, a.Reason ?? a.RecordId ?? "—", null, null,
                    a.Severity.ToString())))
                .OrderByDescending(a => a.Date)
                .Take(Math.Clamp(take, 1, 2000))
                .ToList();

            return new EmployeeReportRow(
                u.Id, u.Name, u.Email, u.Role?.Name ?? "—", u.Branch?.NameEn ?? "All Branches",
                u.Status.ToString(), u.LastLoginAt,
                activity.Count == 0 ? null : activity.Max(a => a.Date),
                completed.Count, Math.Round(gross, 2),
                Math.Round(completed.Sum(o => o.DiscountTotal), 2),
                Math.Round(completed.Sum(o => o.VatTotal), 2),
                Math.Round(completed.Sum(o => o.GrandTotal), 2),
                completed.Count == 0 ? 0 : Math.Round(completed.Sum(o => o.GrandTotal) / completed.Count, 2),
                completed.Count == 0 ? 0 : Math.Round((decimal)completed.Sum(o => o.Lines.Count) / completed.Count, 2),
                gross == 0 ? 0 : Math.Round(completed.Sum(o => o.DiscountTotal) / gross * 100, 2),
                voided.Count, Math.Round(voided.Sum(o => o.GrandTotal), 2),
                approvedRefunds.Count, Math.Round(approvedRefunds.Sum(r => r.NetCashback), 2),
                myShifts.Count, Math.Round(myShifts.Sum(s => s.Variance ?? 0), 2),
                myAudit.Count, myAudit.Count(a => a.Severity == AuditSeverity.Critical),
                activity);
        })
        .OrderByDescending(r => r.NetSales).ThenBy(r => r.Name)
        .ToList();

        return Ok(rows);
    }
}
