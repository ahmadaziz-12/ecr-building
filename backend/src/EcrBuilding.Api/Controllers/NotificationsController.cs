using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

public record NotificationDto(string Id, string Type, string Severity, string Message, DateTime AsOf, string? Link);

// Real, permission-scoped alerts for the navbar bell — reuses the same counts as
// AdminOverviewController's system-health rollup plus a low-stock check, but surfaced as
// individual dismissable-looking items instead of aggregate numbers. No separate module gate at
// the endpoint level (every authenticated role should see SOMETHING relevant to them); each
// item is only included if the caller's own `perm:{Module}` claim allows viewing that module, so
// a Cashier never sees HR/Admin-only alerts they have no access to act on.
[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<NotificationDto>>> List(CancellationToken ct)
    {
        bool Can(ModuleArea module, AccessLevel min = AccessLevel.View)
        {
            var claim = User.FindFirst($"perm:{module}")?.Value;
            var level = Enum.TryParse<AccessLevel>(claim, out var parsed) ? parsed : AccessLevel.None;
            return level >= min;
        }

        var now = DateTime.UtcNow;
        var notifications = new List<NotificationDto>();

        if (Can(ModuleArea.Inventory))
        {
            var levels = await db.StockLevels.Include(s => s.Product).ToListAsync(ct);
            var critical = levels.Count(s => s.Available <= 0);
            var low = levels.Count(s => s.Available > 0 && s.Available <= (s.Product?.ReorderLevel ?? 0));
            if (critical > 0) notifications.Add(new("stock-critical", "Stock", "Critical", $"{critical} product(s) out of stock", now, "/stock/stocks"));
            if (low > 0) notifications.Add(new("stock-low", "Stock", "Warning", $"{low} product(s) approaching reorder level", now, "/stock/stocks"));

            // Branch shop-floor stock is what a cashier can actually sell — a healthy warehouse
            // doesn't help if the branch's own shelf is empty, so this is tracked separately.
            var branchLevels = await db.BranchStockLevels.Include(s => s.Product).ToListAsync(ct);
            var branchCritical = branchLevels.Count(s => s.Available <= 0);
            var branchLow = branchLevels.Count(s => s.Available > 0 && s.Available <= (s.Product?.ReorderLevel ?? 0));
            if (branchCritical > 0) notifications.Add(new("branch-stock-critical", "Branch Stock", "Critical", $"{branchCritical} product(s) out of stock at a branch", now, "/stock/branch-stock"));
            if (branchLow > 0) notifications.Add(new("branch-stock-low", "Branch Stock", "Warning", $"{branchLow} product(s) approaching reorder level at a branch", now, "/stock/branch-stock"));
        }

        if (Can(ModuleArea.Hr))
        {
            var pendingLeaves = await db.Leaves.CountAsync(l =>
                l.Status == Domain.Entities.LeaveStatus.Submitted || l.Status == Domain.Entities.LeaveStatus.PendingManager || l.Status == Domain.Entities.LeaveStatus.PendingHr, ct);
            if (pendingLeaves > 0) notifications.Add(new("leaves-pending", "HR", "Info", $"{pendingLeaves} leave request(s) awaiting approval", now, "/hrms/leave"));
        }

        if (Can(ModuleArea.Admin))
        {
            var openMaintenance = await db.MaintenanceTickets.CountAsync(t =>
                t.Status == Domain.Entities.MaintenanceStatus.Open || t.Status == Domain.Entities.MaintenanceStatus.InProgress, ct);
            if (openMaintenance > 0) notifications.Add(new("maintenance-open", "Maintenance", "Warning", $"{openMaintenance} maintenance ticket(s) open", now, "/admin/maintenance"));

            var yesterday = now.AddHours(-24);
            var criticalEvents = await db.AuditLogs.CountAsync(a => a.Severity == AuditSeverity.Critical && a.CreatedAt >= yesterday, ct);
            if (criticalEvents > 0) notifications.Add(new("audit-critical", "Security", "Critical", $"{criticalEvents} critical audit event(s) in the last 24 hours", now, "/admin/audit-logs"));

            var complianceOverdue = await db.ComplianceControls.CountAsync(c => c.Status == Domain.Entities.ComplianceStatus.Overdue, ct);
            if (complianceOverdue > 0) notifications.Add(new("compliance-overdue", "Compliance", "Critical", $"{complianceOverdue} compliance control(s) overdue", now, "/admin/compliance"));
        }

        if (Can(ModuleArea.Orders))
        {
            var failedInvoices = await db.ZatcaInvoices.CountAsync(i => i.Status == Domain.Entities.ZatcaInvoiceStatus.Failed, ct);
            if (failedInvoices > 0) notifications.Add(new("zatca-failed", "ZATCA", "Critical", $"{failedInvoices} ZATCA invoice(s) failed submission", now, "/admin/zatca-invoices"));
        }

        return Ok(notifications.OrderByDescending(n => n.Severity == "Critical").ThenByDescending(n => n.Severity == "Warning").ToList());
    }
}
