using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Delivery reporting for the Insights → Reports console (BRD §11): the dispatch ledger itself, and
// the driver scorecard that falls out of it. Both live behind /insights/reports rather than the
// Delivery module's own screens, because the question they answer is "how did dispatch perform over
// a period", not "what do I dispatch next" — the pipeline board already covers the latter.
//
// Same two conventions as every other report endpoint (see ReportFilters): the date window's upper
// bound is exclusive, and an absent/empty filter array means "no constraint".

public record DeliveryReportLine(
    string Sku, string Product, string Category, string Uom, decimal Ordered, decimal Loaded,
    decimal Delivered, decimal Missing, decimal Damaged, decimal UnitWeight);

public record DeliveryReportRow(
    int Id, string DeliveryNo, DateTime Date, string? OrderNo, string Branch, string? Customer,
    string? Project, string? PoRef, string Area, string City, string Priority, string Stage,
    string PaymentStatus, string? Driver, string? Vehicle,
    DateTime PromisedDate, string PromisedTime, string? TimeSlot,
    DateTime? DispatchedAt, DateTime? DeliveredAt, decimal? CycleHours, int DaysLate, string Punctuality,
    decimal WeightTons, int ItemCount, decimal QtyOrdered, decimal QtyLoaded, decimal QtyDelivered,
    decimal QtyMissing, decimal QtyDamaged, decimal FulfilledPct,
    decimal Amount, decimal DeliveryFee, decimal HandlingCharge, decimal HeavyCharge,
    decimal DiscountCharge, decimal VatCharge, decimal TotalCharges,
    string? ReceivedBy, string? Proof, string? FailureReason, string? Notes,
    IReadOnlyList<DeliveryReportLine> Items);

public record DriverPerformanceRow(
    int DriverId, string Driver, string Branch, string? Vehicle, string Status, DateTime LicenseExpiry,
    int Deliveries, int Delivered, int Failed, int Cancelled, int InFlight,
    decimal OnTimePct, decimal AvgCycleHours, decimal AvgDaysLate,
    decimal TonnageDelivered, decimal DeliveredValue, decimal FeeRevenue,
    decimal QtyDelivered, decimal QtyMissing, decimal QtyDamaged, decimal FulfilmentPct,
    DateTime? LastDeliveryAt);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class DeliveryReportsController(AppDbContext db) : ReportControllerBase
{
    // A delivery is "on time" when it landed on or before the promised CALENDAR DAY — PromisedTime is
    // a free-text slot ("Before 12:00"), so there is no promised instant to compare against and
    // comparing raw timestamps would mark an 08:00 delivery against a midnight-stamped promise late.
    private static (int DaysLate, string Punctuality) Punctuality(DeliveryOrder d, DateTime today)
    {
        var promised = d.PromisedDate.Date;
        if (d.DeliveredAt is not null)
        {
            var late = (d.DeliveredAt.Value.Date - promised).Days;
            return (Math.Max(0, late), late <= 0 ? "On Time" : "Late");
        }
        if (d.Stage is DeliveryStage.Cancelled) return (0, "Cancelled");
        if (d.Stage is DeliveryStage.Failed or DeliveryStage.ReturnedToBranch) return (Math.Max(0, (today - promised).Days), "Failed");
        var overdue = (today - promised).Days;
        return (Math.Max(0, overdue), overdue > 0 ? "Overdue" : "Scheduled");
    }

    private IQueryable<DeliveryOrder> DeliveriesInWindow(DateTime from, DateTime toExclusive) =>
        db.DeliveryOrders
            .Include(d => d.Order).Include(d => d.Branch).Include(d => d.Customer)
            .Include(d => d.Driver).Include(d => d.Vehicle)
            .Include(d => d.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(d => d.CreatedAt >= from && d.CreatedAt < toExclusive);

    // Delivery Report — every dispatch ticket in the period with its promise, its outcome, the load
    // that actually went out, and the charges billed for taking it there.
    [HttpGet("delivery-orders")]
    public async Task<ActionResult<List<DeliveryReportRow>>> DeliveryOrders(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? customerId, [FromQuery] int[]? driverId,
        [FromQuery] int[]? vehicleId, [FromQuery] int[]? productId, [FromQuery] int[]? categoryId,
        [FromQuery] string[]? stage, [FromQuery] string[]? priority, [FromQuery] string[]? zone,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var deliveries = await DeliveriesInWindow(f, t).ToListAsync(ct);
        var today = DateTime.UtcNow.AddMinutes(-TzOffsetMinutes).Date;

        var rows = deliveries
            .Where(d => ReportFilters.Matches(branchId, d.BranchId)
                && ReportFilters.Matches(customerId, d.CustomerId)
                && ReportFilters.Matches(driverId, d.DriverId)
                && ReportFilters.Matches(vehicleId, d.VehicleId)
                && ReportFilters.Matches(stage, d.Stage.ToString())
                && ReportFilters.Matches(priority, d.Priority.ToString())
                && ReportFilters.Matches(zone, d.Area))
            .Select(d =>
            {
                var lines = d.Lines
                    .Where(l => ReportFilters.Matches(productId, l.ProductId)
                        && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0))
                    .ToList();
                var ordered = lines.Sum(l => l.Ordered);
                var delivered = lines.Sum(l => l.DeliveredQty);
                var (daysLate, punctuality) = Punctuality(d, today);
                // Dispatch-to-doorstep only. Measuring from creation would fold in however long the
                // ticket sat waiting for a driver, which is a scheduling figure, not a driving one.
                var cycle = d.DispatchedAt is not null && d.DeliveredAt is not null
                    ? (decimal?)Math.Round((decimal)(d.DeliveredAt.Value - d.DispatchedAt.Value).TotalHours, 2)
                    : null;
                return new DeliveryReportRow(
                    d.Id, d.DeliveryNo, d.CreatedAt, d.Order?.OrderNo, d.Branch?.NameEn ?? "",
                    d.Customer?.NameEn, d.Project, d.PoRef, d.Area, d.City,
                    d.Priority.ToString(), d.Stage.ToString(), d.PaymentStatus.ToString(),
                    d.Driver?.Name, d.Vehicle?.Registration,
                    d.PromisedDate, d.PromisedTime, d.TimeSlot,
                    d.DispatchedAt, d.DeliveredAt, cycle, daysLate, punctuality,
                    d.WeightTons, lines.Count,
                    Math.Round(ordered, 2), Math.Round(lines.Sum(l => l.LoadedQty), 2), Math.Round(delivered, 2),
                    Math.Round(lines.Sum(l => l.MissingQty), 2), Math.Round(lines.Sum(l => l.DamagedQty), 2),
                    ordered == 0 ? 0 : Math.Round(delivered / ordered * 100, 2),
                    Math.Round(d.Amount, 2), Math.Round(d.FeeCharge, 2), Math.Round(d.HandlingCharge, 2),
                    Math.Round(d.HeavyCharge, 2), Math.Round(d.DiscountCharge, 2), Math.Round(d.VatCharge, 2),
                    Math.Round(d.FeeCharge + d.HandlingCharge + d.HeavyCharge - d.DiscountCharge + d.VatCharge, 2),
                    d.ReceivedBy, d.Proof, d.FailureReason, d.Notes,
                    lines.Select(l => new DeliveryReportLine(
                        l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                        l.Uom, l.Ordered, l.LoadedQty, l.DeliveredQty, l.MissingQty, l.DamagedQty, l.UnitWeight)).ToList());
            })
            // A product/category filter narrows to the tickets that actually carried it, the same way
            // the purchase-order and returns reports treat their line filters.
            .Where(r => r.ItemCount > 0)
            .OrderByDescending(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    // Driver Performance — the delivery ledger rolled up per driver: punctuality, cycle time, tonnage
    // moved, and the shortfall/damage they arrived with.
    [HttpGet("driver-performance")]
    public async Task<ActionResult<List<DriverPerformanceRow>>> DriverPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? driverId, [FromQuery] int[]? vehicleId,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var deliveries = await DeliveriesInWindow(f, t).ToListAsync(ct);
        deliveries = deliveries
            .Where(d => d.DriverId is not null
                && ReportFilters.Matches(branchId, d.BranchId)
                && ReportFilters.Matches(driverId, d.DriverId)
                && ReportFilters.Matches(vehicleId, d.VehicleId))
            .ToList();

        var rows = deliveries.GroupBy(d => d.DriverId!.Value).Select(g =>
        {
            var driver = g.First().Driver;
            var delivered = g.Where(d => d.Stage == DeliveryStage.Delivered || d.DeliveredAt is not null).ToList();
            var failed = g.Count(d => d.Stage is DeliveryStage.Failed or DeliveryStage.ReturnedToBranch);
            var cancelled = g.Count(d => d.Stage == DeliveryStage.Cancelled);
            // Punctuality is only meaningful over completed runs — dividing by every assigned ticket
            // would score a driver down for jobs still on the truck.
            var onTime = delivered.Count(d => d.DeliveredAt!.Value.Date <= d.PromisedDate.Date);
            var cycles = delivered
                .Where(d => d.DispatchedAt is not null)
                .Select(d => (decimal)(d.DeliveredAt!.Value - d.DispatchedAt!.Value).TotalHours)
                .ToList();
            var lateDays = delivered.Select(d => (decimal)Math.Max(0, (d.DeliveredAt!.Value.Date - d.PromisedDate.Date).Days)).ToList();
            var lines = delivered.SelectMany(d => d.Lines).ToList();
            var orderedQty = lines.Sum(l => l.Ordered);
            var deliveredQty = lines.Sum(l => l.DeliveredQty);

            return new DriverPerformanceRow(
                g.Key, driver?.Name ?? $"Driver {g.Key}", driver?.Branch?.NameEn ?? "",
                driver?.Vehicle?.Registration, driver?.Status.ToString() ?? "", driver?.LicenseExpiry ?? default,
                g.Count(), delivered.Count, failed, cancelled,
                g.Count(d => d.Stage is DeliveryStage.Assigned or DeliveryStage.Loading
                    or DeliveryStage.ReadyToDispatch or DeliveryStage.Dispatched or DeliveryStage.PartiallyDelivered),
                delivered.Count == 0 ? 0 : Math.Round((decimal)onTime / delivered.Count * 100, 2),
                cycles.Count == 0 ? 0 : Math.Round(cycles.Average(), 2),
                lateDays.Count == 0 ? 0 : Math.Round(lateDays.Average(), 2),
                Math.Round(delivered.Sum(d => d.WeightTons), 2),
                Math.Round(delivered.Sum(d => d.Amount), 2),
                Math.Round(delivered.Sum(d => d.FeeCharge + d.HandlingCharge + d.HeavyCharge), 2),
                Math.Round(deliveredQty, 2), Math.Round(lines.Sum(l => l.MissingQty), 2),
                Math.Round(lines.Sum(l => l.DamagedQty), 2),
                orderedQty == 0 ? 0 : Math.Round(deliveredQty / orderedQty * 100, 2),
                delivered.Count == 0 ? null : delivered.Max(d => d.DeliveredAt));
        })
        .OrderByDescending(r => r.Delivered).ThenByDescending(r => r.Deliveries)
        .ToList();

        return Ok(rows);
    }
}
