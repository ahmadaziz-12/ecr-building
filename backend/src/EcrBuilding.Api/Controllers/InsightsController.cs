using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Application.Insights;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/insights")]
[Authorize]
[RequireModule(ModuleArea.Insights, AccessLevel.View)]
public class InsightsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet("sales")]
    public async Task<ActionResult<List<SalesSegmentDto>>> Sales(CancellationToken ct)
    {
        var lines = await db.OrderLines.Include(l => l.Product).ThenInclude(p => p!.Category).Include(l => l.Order)
            .Where(l => l.Order!.Status == OrderStatus.Completed).ToListAsync(ct);
        var totalValue = lines.Sum(l => l.LineTotal);
        // Only a Completed return actually paid cash back out — a PendingApproval or Quarantine
        // return hasn't happened yet and might still be rejected (same rule ReportsController's
        // RefundMethods/Vat already apply; this endpoint had drifted from that convention).
        var returnsByCategory = await db.ReturnLines.Include(l => l.Product).ThenInclude(p => p!.Category)
            .Include(l => l.Return).Where(l => l.Return!.Status == ReturnStatus.Completed).ToListAsync(ct);

        var segments = lines.GroupBy(l => l.Product?.Category?.NameEn ?? "Uncategorized").Select(g =>
        {
            var value = g.Sum(l => l.LineTotal);
            var tx = g.Select(l => l.OrderId).Distinct().Count();
            var returns = returnsByCategory.Where(r => r.Product?.Category?.NameEn == g.Key).Sum(r => r.Amount);
            return new SalesSegmentDto(
                g.Key, value, totalValue == 0 ? 0 : Math.Round(value / totalValue * 100, 1), tx,
                tx == 0 ? 0 : Math.Round(value / tx, 2), value == 0 ? 0 : Math.Round(returns / value * 100, 1), "▲");
        }).OrderByDescending(s => s.Value).ToList();

        return Ok(segments);
    }

    [HttpGet("kpi")]
    public async Task<ActionResult<List<KpiDto>>> Kpis(CancellationToken ct)
    {
        var kpis = await db.Kpis.ToListAsync(ct);
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);

        var netSales = await db.Orders.Where(o => o.Status == OrderStatus.Completed && o.CreatedAt >= monthStart).SumAsync(o => o.GrandTotal, ct);
        var revenue = await db.OrderLines.Include(l => l.Order).Where(l => l.Order!.Status == OrderStatus.Completed && l.Order!.CreatedAt >= monthStart).SumAsync(l => l.LineTotal, ct);
        var cost = await db.OrderLines.Include(l => l.Order).Include(l => l.Product)
            .Where(l => l.Order!.Status == OrderStatus.Completed && l.Order!.CreatedAt >= monthStart).SumAsync(l => l.Qty * l.Product!.CostPrice, ct);
        var grossMarginPct = revenue == 0 ? 0 : Math.Round((revenue - cost) / revenue * 100, 1);
        var returnsValue = await db.ReturnLines.Include(l => l.Return)
            .Where(l => l.Return!.CreatedAt >= monthStart && l.Return!.Status == ReturnStatus.Completed).SumAsync(l => l.Amount, ct);
        var returnRatePct = netSales == 0 ? 0 : Math.Round(returnsValue / netSales * 100, 1);
        var totalInvoices = await db.ZatcaInvoices.CountAsync(ct);
        var clearedInvoices = await db.ZatcaInvoices.CountAsync(i => i.Status == ZatcaInvoiceStatus.Cleared, ct);
        var zatcaSuccessPct = totalInvoices == 0 ? 100 : Math.Round((decimal)clearedInvoices / totalInvoices * 100, 1);

        decimal Actual(string key) => key switch
        {
            "NetSalesMtd" => netSales,
            "GrossMarginPct" => grossMarginPct,
            "ReturnRatePct" => returnRatePct,
            "ZatcaSuccessPct" => zatcaSuccessPct,
            _ => 0,
        };
        // Most KPIs here are "higher is better" (Sales, Margin, ZATCA Success), but a rate KPI like
        // Return Rate is a CEILING — its target reads "≤ 5%", and being further under it is good, not
        // bad. Applying the higher-is-better formula uniformly showed a 1.5% return rate (well inside
        // a 5% ceiling) as "Critical". Metric keys ending "Pct" that describe a rate-of-a-bad-thing
        // are the ceiling ones; today that's exactly ReturnRatePct.
        bool IsCeilingMetric(string key) => key == "ReturnRatePct";

        return Ok(kpis.Select(k =>
        {
            var actual = Actual(k.MetricKey);
            var isCeiling = IsCeilingMetric(k.MetricKey);
            var rawVariance = k.Target == 0 ? 0 : Math.Round((actual - k.Target) / k.Target * 100, 1);
            // For a ceiling metric, "over target" (positive rawVariance) is the bad direction — flip
            // the sign so "variance >= 0" still means "meeting the goal" for every KPI uniformly.
            var variance = isCeiling ? -rawVariance : rawVariance;
            var status = variance >= 0 ? "On Target" : variance >= -5 ? "Below Target" : "Critical";
            return new KpiDto(k.Id, k.Name, k.Category, k.Owner, k.Target, actual, variance, status, k.Period);
        }).ToList());
    }

    [HttpPut("kpi/{id:int}/target")]
    [RequireModule(ModuleArea.Insights, AccessLevel.Edit)]
    public async Task<ActionResult> UpdateKpiTarget(int id, UpdateKpiTargetRequest request, CancellationToken ct)
    {
        var kpi = await db.Kpis.FirstOrDefaultAsync(k => k.Id == id, ct);
        if (kpi is null) return NotFound();

        kpi.Target = request.Target;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("insights", "KPI_TARGET_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(new { ok = true });
    }

    [HttpGet("reports")]
    public async Task<ActionResult<List<ReportDefinitionDto>>> Reports(CancellationToken ct)
    {
        var rows = await db.ReportDefinitions.OrderBy(r => r.Code).ToListAsync(ct);
        return Ok(rows.Select(r => new ReportDefinitionDto(r.Id, r.Code, r.Name, r.Category, r.Owner, r.Frequency, r.Format, r.Status.ToString())).ToList());
    }

    [HttpPut("reports/{id:int}/status")]
    [RequireModule(ModuleArea.Insights, AccessLevel.Edit)]
    public async Task<ActionResult<ReportDefinitionDto>> SetReportStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var report = await db.ReportDefinitions.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        report.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("insights", "REPORT_STATUS_CHANGED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(new ReportDefinitionDto(report.Id, report.Code, report.Name, report.Category, report.Owner, report.Frequency, report.Format, report.Status.ToString()));
    }

    [HttpGet("bi")]
    public async Task<ActionResult<List<BiFeedDto>>> BiFeeds(CancellationToken ct)
    {
        var rows = await db.BiFeeds.OrderBy(f => f.Name).ToListAsync(ct);
        return Ok(rows.Select(f => new BiFeedDto(f.Id, f.Name, f.Source, f.Destination, f.Frequency, f.LastRun, f.Rows, f.Failed, f.Latency, f.Status)).ToList());
    }

    [HttpPost("bi/{id:int}/retry")]
    [RequireModule(ModuleArea.Insights, AccessLevel.Edit)]
    public async Task<ActionResult<BiFeedDto>> RetryBiFeed(int id, CancellationToken ct)
    {
        var feed = await db.BiFeeds.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (feed is null) return NotFound();

        feed.Failed = 0;
        feed.LastRun = DateTime.UtcNow;
        feed.Status = "Healthy";
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("insights", "BI_FEED_RETRIED", id.ToString(), cancellationToken: ct);
        return Ok(new BiFeedDto(feed.Id, feed.Name, feed.Source, feed.Destination, feed.Frequency, feed.LastRun, feed.Rows, feed.Failed, feed.Latency, feed.Status));
    }
}

[ApiController]
[Route("api/admin/overview")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class AdminOverviewController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AdminOverviewDto>> Get(CancellationToken ct)
    {
        var activeUsers = await db.Users.CountAsync(u => u.Status == UserStatus.Active, ct);
        // HR leave requests AND POS/finance approval requests (discount overrides, refund-window
        // overrides, voids, credit overrides) are both legitimately "something needs a manager's
        // sign-off" — this KPI is the company-wide backlog, not HR-only, so both must count.
        var pendingLeaveApprovals = await db.Leaves.CountAsync(l => l.Status == LeaveStatus.Submitted || l.Status == LeaveStatus.PendingManager || l.Status == LeaveStatus.PendingHr, ct);
        var pendingRequestApprovals = await db.ApprovalRequests.CountAsync(a => a.Status == ApprovalStatus.Pending, ct);
        var pendingApprovals = pendingLeaveApprovals + pendingRequestApprovals;
        var openMaintenance = await db.MaintenanceTickets.CountAsync(t => t.Status == MaintenanceStatus.Open || t.Status == MaintenanceStatus.InProgress, ct);
        var yesterday = DateTime.UtcNow.AddHours(-24);
        var criticalEvents = await db.AuditLogs.CountAsync(a => a.Severity == AuditSeverity.Critical && a.CreatedAt >= yesterday, ct);
        var complianceOverdue = await db.ComplianceControls.CountAsync(c => c.Status == ComplianceStatus.Overdue, ct);

        var totalInvoices = await db.ZatcaInvoices.CountAsync(ct);
        var clearedInvoices = await db.ZatcaInvoices.CountAsync(i => i.Status == ZatcaInvoiceStatus.Cleared, ct);
        var zatcaRate = totalInvoices == 0 ? 100m : Math.Round((decimal)clearedInvoices / totalInvoices * 100, 1);
        // Onboarding is per-branch (ZATCA Model B) — picking one arbitrary identity to represent
        // company-wide status could report "Healthy" while a branch that legally cannot issue
        // e-invoices yet sits unnoticed. Healthy only when EVERY branch has reached ProductionReady;
        // otherwise show how many have and the least-advanced status still outstanding.
        var identities = await db.ZatcaIdentities.ToListAsync(ct);
        var readyCount = identities.Count(i => i.OnboardingStatus == ZatcaOnboardingStatus.ProductionReady);
        var allReady = identities.Count > 0 && readyCount == identities.Count;
        var leastReadyStatus = identities.Count == 0
            ? ZatcaOnboardingStatus.NotStarted
            : identities.Min(i => i.OnboardingStatus);
        var onboardingValue = identities.Count == 0 ? "NotStarted" : $"{readyCount}/{identities.Count} branches ({leastReadyStatus})";

        var areas = new List<OverviewAreaDto>
        {
            new("Data API", "Healthy", "IT", "Availability", "100%", "≥ 99.9%"),
            new("ZATCA Integration", zatcaRate >= 99 ? "Healthy" : "Degraded", "Finance", "Success Rate", $"{zatcaRate}%", "≥ 99.5%"),
            new("Payment Gateway", "Healthy", "Finance", "Mode", "Simulated (happy-path)", "N/A"),
            new("Database", "Healthy", "IT", "Provider", "MariaDB", "N/A"),
            new("ZATCA Onboarding", allReady ? "Healthy" : "Pending", "Finance", "Status", onboardingValue, "All branches ProductionReady"),
        };

        return Ok(new AdminOverviewDto(activeUsers, pendingApprovals, openMaintenance, criticalEvents, complianceOverdue, areas));
    }
}
