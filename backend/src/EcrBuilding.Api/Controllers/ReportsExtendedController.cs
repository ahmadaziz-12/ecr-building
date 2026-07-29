using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// The operational-reports set that the original ReportsController didn't cover: item/catalog,
// inventory and low stock, purchase orders, both return directions, damaged goods, stock-count
// reconciliation, and the employee audit trail — plus the margin/performance cuts that fall out of
// the same joins.
//
// Two conventions hold across every endpoint here, and both exist to fix real filter bugs:
//
//  1. Date windows use an EXCLUSIVE upper bound (ReportFilters.Range): the caller sends a plain
//     calendar day, the server turns "to" into to.Date.AddDays(1) and compares with '<'. Comparing
//     `CreatedAt <= to` against a bare date silently drops every row timestamped after midnight on
//     the last day — which is what made the Supplier Returns date filter look broken.
//  2. Every list filter is multi-valued (`?branchId=1&branchId=2`), and an empty/absent array means
//     "no constraint" rather than "match nothing".

public static class ReportFilters
{
    /// <summary>
    /// Inclusive `from` day, exclusive `to`-plus-one-day. Never compare a timestamp column with
    /// `&lt;= to` when `to` came off a date picker.
    ///
    /// <paramref name="tzOffsetMinutes"/> is the caller's JavaScript getTimezoneOffset() — minutes to
    /// ADD to local time to reach UTC, so UTC+3 sends -180. Timestamps are stored as UTC instants,
    /// but "today" means the viewer's local day: in Riyadh a 01:00 sale is 22:00 UTC the day before,
    /// so treating the picked calendar day as a UTC day dropped it out of "today" entirely, and the
    /// dashboard (which filters on local instants client-side) disagreed with every report at the
    /// day boundary. Shifting the window by the offset makes both screens describe the same hours.
    /// Defaults to 0, which is the old UTC-day behaviour, so a caller that sends no offset is
    /// unaffected.
    /// </summary>
    public static (DateTime From, DateTime ToExclusive) Range(DateTime? from, DateTime? to, int defaultDays = 30, int tzOffsetMinutes = 0)
    {
        var today = DateTime.UtcNow.AddMinutes(-tzOffsetMinutes).Date;
        var f = (from ?? today.AddDays(-defaultDays)).Date.AddMinutes(tzOffsetMinutes);
        var t = (to ?? today).Date.AddDays(1).AddMinutes(tzOffsetMinutes);
        if (t <= f) t = f.AddDays(1);
        return (f, t);
    }

    public static bool Any<T>(T[]? values) => values is { Length: > 0 };

    // Server-side `IN` filtering must go through a List, never the bound T[] directly: on an
    // array, `Contains` binds to MemoryExtensions.Contains(ReadOnlySpan<T>, T) rather than
    // Enumerable.Contains, and EF can't translate a span — every array-valued filter would fail
    // with "Translation of method 'System.ReadOnlySpan<T>.op_Implicit' failed". List<T>.Contains
    // is an instance method with no span overload to shadow it, so it translates cleanly.
    public static List<T> ForSql<T>(T[]? values) => (values ?? []).ToList();

    public static bool Matches(int[]? filter, int value) => !Any(filter) || filter!.Contains(value);
    public static bool Matches(int[]? filter, int? value) => !Any(filter) || (value is not null && filter!.Contains(value.Value));

    public static bool Matches(string[]? filter, string? value) =>
        !Any(filter) || (value is not null && filter!.Any(f => string.Equals(f, value, StringComparison.OrdinalIgnoreCase)));

    /// <summary>
    /// Which location grains a stock report should emit (warehouse rows, branch rows, or both).
    ///
    /// A Branch filter on its own means "that branch's own stock". Folding in the warehouses that
    /// belong to the branch as well returned the same SKU twice — once as "Main Yard", once as
    /// "Riyadh Main" — which reads as duplicate rows with the branch name attached to both.
    /// Warehouse stock is still one click away: tick Location Type = Warehouse, or name a
    /// warehouse, and the warehouse grain comes back (narrowed to those branches).
    /// </summary>
    public static (bool Warehouse, bool Branch) LocationGrains(string[]? locationType, int[]? branchId, int[]? warehouseId)
    {
        // An explicit Location Type is the user speaking directly — honour it verbatim.
        if (Any(locationType))
            return (locationType!.Any(l => string.Equals(l, "Warehouse", StringComparison.OrdinalIgnoreCase)),
                    locationType!.Any(l => string.Equals(l, "Branch", StringComparison.OrdinalIgnoreCase)));
        var branchOnly = Any(branchId) && !Any(warehouseId);
        return (!branchOnly, true);
    }
}

/// <summary>
/// Shared base for the report controllers: gives every endpoint the caller's timezone offset so
/// date windows land on the viewer's calendar day rather than UTC's. The offset rides on a header
/// rather than a query param so adding it didn't mean editing 20-odd endpoint signatures, and an
/// absent header is simply UTC.
/// </summary>
public abstract class ReportControllerBase : ControllerBase
{
    // Clamped to ±14h, the real-world range of UTC offsets — a malformed or hostile header can
    // shift the window by at most a day, never into an unbounded scan.
    protected int TzOffsetMinutes =>
        int.TryParse(Request.Headers["X-Tz-Offset"].FirstOrDefault(), out var minutes)
            ? Math.Clamp(minutes, -840, 840)
            : 0;

    protected (DateTime From, DateTime ToExclusive) Window(DateTime? from, DateTime? to, int defaultDays = 30) =>
        ReportFilters.Range(from, to, defaultDays, TzOffsetMinutes);
}

// ————————————————————————— Filter options —————————————————————————

public record FilterOption(string Id, string Label, string? Sub);
public record ReportFilterOptionsDto(
    IReadOnlyList<FilterOption> Branches, IReadOnlyList<FilterOption> Warehouses, IReadOnlyList<FilterOption> Categories,
    IReadOnlyList<FilterOption> Products, IReadOnlyList<FilterOption> Suppliers, IReadOnlyList<FilterOption> Customers,
    IReadOnlyList<FilterOption> Users, IReadOnlyList<FilterOption> Employees,
    IReadOnlyList<FilterOption> Roles,
    IReadOnlyList<string> PurchaseOrderStatuses, IReadOnlyList<string> RtsStatuses, IReadOnlyList<string> ReturnTypes,
    IReadOnlyList<string> ReturnStatuses, IReadOnlyList<string> RefundMethods, IReadOnlyList<string> DamageReasons,
    IReadOnlyList<string> StockCountStatuses, IReadOnlyList<string> PaymentMethods, IReadOnlyList<string> AuditModules,
    IReadOnlyList<string> AuditEvents, IReadOnlyList<string> Brands, IReadOnlyList<string> StockStatuses,
    IReadOnlyList<string> SupplierTypes,
    // Delivery and shift reports: their pickers need the fleet and till dimensions no other report used.
    IReadOnlyList<FilterOption> Terminals, IReadOnlyList<FilterOption> Drivers, IReadOnlyList<FilterOption> Vehicles,
    IReadOnlyList<FilterOption> DeliveryZones, IReadOnlyList<string> DeliveryStages,
    IReadOnlyList<string> DeliveryPriorities, IReadOnlyList<string> ShiftStatuses);

// One round-trip that populates every multi-select in the reports console, so each report doesn't
// re-fetch its own copy of the branch/category/product lists.
[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class ReportFilterOptionsController(AppDbContext db) : ControllerBase
{
    [HttpGet("filter-options")]
    public async Task<ActionResult<ReportFilterOptionsDto>> Options(CancellationToken ct)
    {
        var branches = await db.Branches.OrderBy(b => b.NameEn)
            .Select(b => new FilterOption(b.Id.ToString(), b.NameEn, b.Code)).ToListAsync(ct);
        var warehouses = await db.Warehouses.Include(w => w.Branch).OrderBy(w => w.Name)
            .Select(w => new FilterOption(w.Id.ToString(), w.Name, w.Branch!.NameEn)).ToListAsync(ct);
        var categories = await db.Categories.OrderBy(c => c.NameEn)
            .Select(c => new FilterOption(c.Id.ToString(), c.NameEn, c.Code)).ToListAsync(ct);
        var products = await db.Products.OrderBy(p => p.Sku)
            .Select(p => new FilterOption(p.Id.ToString(), p.NameEn, p.Sku)).ToListAsync(ct);
        var suppliers = await db.Suppliers.OrderBy(s => s.NameEn)
            .Select(s => new FilterOption(s.Id.ToString(), s.NameEn, s.Code)).ToListAsync(ct);
        var customers = await db.Customers.OrderBy(c => c.NameEn)
            .Select(c => new FilterOption(c.Id.ToString(), c.NameEn, c.Phone)).ToListAsync(ct);
        var users = await db.Users.OrderBy(u => u.Name)
            .Select(u => new FilterOption(u.Id.ToString(), u.Name, u.Email)).ToListAsync(ct);
        var employees = await db.Employees.Include(e => e.Branch).OrderBy(e => e.FirstName)
            .Select(e => new FilterOption(e.Id.ToString(), e.FirstName + " " + e.LastName, e.Designation)).ToListAsync(ct);
        // Roles, not HR departments: the Employee Report is sourced from login accounts and
        // transactions so it keeps working with the HR module absent.
        var roles = await db.Roles.OrderBy(r => r.Name)
            .Select(r => new FilterOption(r.Id.ToString(), r.Name, null)).ToListAsync(ct);
        var brands = await db.Products.Where(p => p.Brand != null && p.Brand != "")
            .Select(p => p.Brand!).Distinct().OrderBy(b => b).ToListAsync(ct);
        var supplierTypes = await db.Suppliers.Where(s => s.Type != "")
            .Select(s => s.Type).Distinct().OrderBy(x => x).ToListAsync(ct);
        // Audit modules/events come from the data rather than an enum — the audit trail is
        // free-text by design, so the only honest option list is what's actually been logged.
        var auditModules = await db.AuditLogs.Select(a => a.Module).Distinct().OrderBy(m => m).ToListAsync(ct);
        var auditEvents = await db.AuditLogs.Select(a => a.Event).Distinct().OrderBy(e => e).Take(300).ToListAsync(ct);
        var refundMethods = await db.Returns.Select(r => r.RefundMethod).Distinct().OrderBy(m => m).ToListAsync(ct);
        var terminals = await db.Terminals.Include(t => t.Branch).OrderBy(t => t.Name)
            .Select(t => new FilterOption(t.Id.ToString(), t.Name, t.Branch!.NameEn)).ToListAsync(ct);
        var drivers = await db.Drivers.Include(d => d.Branch).OrderBy(d => d.Name)
            .Select(d => new FilterOption(d.Id.ToString(), d.Name, d.Branch!.NameEn)).ToListAsync(ct);
        var vehicles = await db.Vehicles.OrderBy(v => v.Registration)
            .Select(v => new FilterOption(v.Id.ToString(), v.Registration, v.Type.ToString())).ToListAsync(ct);
        // Zones filter on DeliveryOrder.Area, which stores the zone NAME rather than an id, so the
        // option ids are names too — sending an id here would match nothing.
        var deliveryZones = await db.DeliveryZones.OrderBy(z => z.Name)
            .Select(z => new FilterOption(z.Name, z.Name, z.City)).ToListAsync(ct);

        return Ok(new ReportFilterOptionsDto(
            branches, warehouses, categories, products, suppliers, customers, users, employees, roles,
            Names<PurchaseOrderStatus>(), Names<ReturnToSupplierStatus>(), Names<ReturnType>(), Names<ReturnStatus>(),
            refundMethods, Names<DamageReasonCode>(), Names<StockCountStatus>(), Names<PaymentMethod>(),
            auditModules, auditEvents, brands,
            ["Healthy", "Low", "Critical"],
            // Supplier.Type is free text, not an enum, so the only honest option list is what has
            // actually been entered — same treatment as Brand.
            supplierTypes,
            terminals, drivers, vehicles, deliveryZones,
            Names<DeliveryStage>(), Names<DeliveryPriority>(), Names<CashierShiftStatus>()));
    }

    private static List<string> Names<T>() where T : struct, Enum => Enum.GetNames<T>().ToList();
}

// ————————————————————————— Inventory & catalog reports —————————————————————————

public record ItemReportRow(
    int ProductId, string Sku, string? Barcode, string Name, string Category, string? Brand, string? Supplier,
    string Uom, decimal CostPrice, decimal SellingPrice, decimal VatRate, decimal MarginPct,
    decimal WarehouseOnHand, decimal BranchOnHand, decimal Reserved, decimal Available, int ReorderLevel,
    decimal StockValue, decimal RetailValue, decimal UnitsSold, decimal Revenue, decimal Cogs, decimal GrossProfit,
    decimal ReturnedUnits, decimal ReturnRatePct, DateTime? LastSoldAt, string StockStatus, string Status);

public record InventoryReportRow(
    int ProductId, string Sku, string Name, string Category, string LocationType, int LocationId, string Location,
    string Branch, decimal OnHand, decimal Reserved, decimal Available, int ReorderLevel,
    decimal CostPrice, decimal StockValue, decimal RetailValue, DateTime? LastMovementAt, string Status);

public record LowStockRow(
    int ProductId, string Sku, string Name, string Category, string LocationType, int LocationId, string Location,
    string Branch, decimal OnHand, decimal Reserved, decimal Available, int ReorderLevel, int ReorderQty,
    decimal Shortfall, decimal SuggestedOrderQty, string? Supplier, int LeadTimeDays,
    decimal CostPrice, decimal RestockValue, string Status);

public record StockCountVarianceLine(
    string Sku, string Product, string Category, decimal SystemQty, decimal? CountedQty, decimal Variance,
    decimal UnitCost, decimal VarianceValue, string LineStatus, string? Note);
public record StockCountVarianceRow(
    int Id, string CountNo, DateTime Date, string Warehouse, string Branch, string Scope, string? Category,
    string Status, string? CountedBy, string? ReviewedBy, string? ApprovedBy, string? RejectedBy, string? RejectionReason,
    int Lines, int Counted, int VarianceLines,
    decimal NetVarianceQty, decimal NetVarianceValue, decimal AbsVarianceValue, decimal AccuracyPct,
    IReadOnlyList<StockCountVarianceLine> Items);

public record ExpiryReportRow(
    int BatchId, string Sku, string Product, string Category, string Warehouse, string Branch, string BatchNo,
    DateTime ReceivedDate, DateTime ExpiryDate, int DaysLeft, decimal Qty, decimal UnitCost, decimal Value, string Status);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class InventoryReportsController(AppDbContext db) : ReportControllerBase
{
    // Item Report — the catalog master joined to stock, sales and returns for the window, so one
    // row answers "what is this SKU, what have we got, and how is it performing".
    [HttpGet("item-report")]
    public async Task<ActionResult<List<ItemReportRow>>> ItemReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId, [FromQuery] int[]? categoryId,
        [FromQuery] int[]? productId, [FromQuery] int[]? supplierId, [FromQuery] string[]? brand,
        [FromQuery] string[]? status, [FromQuery] string[]? stockStatus, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);

        var products = await db.Products.Include(p => p.Category).Include(p => p.Supplier).ToListAsync(ct);
        products = products.Where(p =>
            ReportFilters.Matches(categoryId, p.CategoryId)
            && ReportFilters.Matches(productId, p.Id)
            && ReportFilters.Matches(supplierId, p.SupplierId)
            && ReportFilters.Matches(brand, p.Brand)
            && ReportFilters.Matches(status, p.Status.ToString())).ToList();
        var ids = products.Select(p => p.Id).ToHashSet();

        var warehouseLevels = await db.StockLevels.Include(s => s.Warehouse)
            .Where(s => ids.Contains(s.ProductId)).ToListAsync(ct);
        warehouseLevels = warehouseLevels.Where(s =>
            ReportFilters.Matches(warehouseId, s.WarehouseId)
            && (!ReportFilters.Any(branchId) || (s.Warehouse != null && branchId!.Contains(s.Warehouse.BranchId)))).ToList();

        var branchLevels = await db.BranchStockLevels.Where(s => ids.Contains(s.ProductId)).ToListAsync(ct);
        branchLevels = branchLevels.Where(s => ReportFilters.Matches(branchId, s.BranchId)).ToList();

        var soldLines = await db.OrderLines.Include(l => l.Order)
            .Where(l => l.Order!.Status != OrderStatus.Voided && l.Order.CreatedAt >= f && l.Order.CreatedAt < t
                && ids.Contains(l.ProductId))
            .ToListAsync(ct);
        soldLines = soldLines.Where(l => ReportFilters.Matches(branchId, l.Order!.BranchId)).ToList();

        var returnLines = await db.ReturnLines.Include(l => l.Return).ThenInclude(r => r!.Order)
            .Where(l => l.Return!.CreatedAt >= f && l.Return.CreatedAt < t && ids.Contains(l.ProductId))
            .ToListAsync(ct);
        returnLines = returnLines.Where(l =>
            !ReportFilters.Any(branchId) || (l.Return?.Order != null && branchId!.Contains(l.Return.Order.BranchId))).ToList();

        // Last sale is deliberately NOT window-scoped — "last sold 8 months ago" is the useful
        // answer, and a window-scoped version would just repeat the window's end date.
        var lastSold = await db.OrderLines
            .Where(l => l.Order!.Status != OrderStatus.Voided && ids.Contains(l.ProductId))
            .GroupBy(l => l.ProductId)
            .Select(g => new { ProductId = g.Key, At = g.Max(l => l.Order!.CreatedAt) })
            .ToDictionaryAsync(x => x.ProductId, x => (DateTime?)x.At, ct);

        var whByProduct = warehouseLevels.GroupBy(s => s.ProductId).ToDictionary(g => g.Key, g => g.ToList());
        var brByProduct = branchLevels.GroupBy(s => s.ProductId).ToDictionary(g => g.Key, g => g.ToList());
        var soldByProduct = soldLines.GroupBy(l => l.ProductId).ToDictionary(g => g.Key, g => g.ToList());
        var returnedByProduct = returnLines.GroupBy(l => l.ProductId).ToDictionary(g => g.Key, g => g.ToList());

        var rows = products.Select(p =>
        {
            var wh = whByProduct.GetValueOrDefault(p.Id, []);
            var br = brByProduct.GetValueOrDefault(p.Id, []);
            var sold = soldByProduct.GetValueOrDefault(p.Id, []);
            var returned = returnedByProduct.GetValueOrDefault(p.Id, []);

            var whOnHand = wh.Sum(s => s.OnHand);
            var brOnHand = br.Sum(s => s.OnHand);
            var reserved = wh.Sum(s => s.Reserved) + br.Sum(s => s.Reserved);
            var onHand = whOnHand + brOnHand;
            var available = onHand - reserved;
            // StockQty is the stock-UOM quantity actually deducted; Qty is the selling-UOM figure.
            // Legacy rows predate the UOM engine and carry StockQty = 0.
            var units = sold.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty);
            var revenue = sold.Sum(l => l.LineTotal);
            var cogs = units * p.CostPrice;
            var returnedUnits = returned.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty);

            return new ItemReportRow(
                p.Id, p.Sku, p.Barcode, p.NameEn, p.Category?.NameEn ?? "", p.Brand, p.Supplier?.NameEn,
                p.StockUom, p.CostPrice, p.SellingPrice, p.VatRate,
                p.SellingPrice > 0 ? Math.Round((p.SellingPrice - p.CostPrice) / p.SellingPrice * 100, 2) : 0,
                whOnHand, brOnHand, reserved, available, p.ReorderLevel,
                Math.Round(onHand * p.CostPrice, 2), Math.Round(onHand * p.SellingPrice, 2),
                Math.Round(units, 2), Math.Round(revenue, 2), Math.Round(cogs, 2), Math.Round(revenue - cogs, 2),
                Math.Round(returnedUnits, 2), units > 0 ? Math.Round(returnedUnits / units * 100, 2) : 0,
                lastSold.GetValueOrDefault(p.Id),
                available <= 0 ? "Critical" : available <= p.ReorderLevel ? "Low" : "Healthy",
                p.Status.ToString());
        }).ToList();

        if (ReportFilters.Any(stockStatus)) rows = rows.Where(r => ReportFilters.Matches(stockStatus, r.StockStatus)).ToList();
        return Ok(rows.OrderByDescending(r => r.Revenue).ThenBy(r => r.Sku).ToList());
    }

    // Inventory Report — one row per stocked location, so the same SKU appears once per warehouse
    // and once per branch. That's the shape an inventory count/valuation is actually reconciled at.
    [HttpGet("inventory-report")]
    public async Task<ActionResult<List<InventoryReportRow>>> InventoryReport(
        [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId, [FromQuery] int[]? categoryId,
        [FromQuery] int[]? productId, [FromQuery] string[]? locationType, [FromQuery] string[]? stockStatus,
        [FromQuery] bool includeZeroStock = true, CancellationToken ct = default)
    {
        var rows = new List<InventoryReportRow>();
        var lastMovement = await db.StockMovements
            .GroupBy(m => new { m.ProductId, m.BranchId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, At = g.Max(m => m.CreatedAt) })
            .ToListAsync(ct);
        var lastByBranch = lastMovement.ToDictionary(x => (x.ProductId, x.BranchId), x => (DateTime?)x.At);
        var grain = ReportFilters.LocationGrains(locationType, branchId, warehouseId);

        if (grain.Warehouse)
        {
            var levels = await db.StockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Warehouse).ThenInclude(w => w!.Branch).ToListAsync(ct);
            rows.AddRange(levels
                .Where(s => s.Product is not null
                    && ReportFilters.Matches(warehouseId, s.WarehouseId)
                    && ReportFilters.Matches(categoryId, s.Product.CategoryId)
                    && ReportFilters.Matches(productId, s.ProductId)
                    && (!ReportFilters.Any(branchId) || (s.Warehouse != null && branchId!.Contains(s.Warehouse.BranchId))))
                .Select(s => new InventoryReportRow(
                    s.ProductId, s.Product!.Sku, s.Product.NameEn, s.Product.Category?.NameEn ?? "",
                    "Warehouse", s.WarehouseId, s.Warehouse?.Name ?? "", s.Warehouse?.Branch?.NameEn ?? "",
                    s.OnHand, s.Reserved, s.Available, s.Product.ReorderLevel, s.Product.CostPrice,
                    Math.Round(s.OnHand * s.Product.CostPrice, 2), Math.Round(s.OnHand * s.Product.SellingPrice, 2),
                    lastByBranch.GetValueOrDefault((s.ProductId, s.Warehouse?.BranchId ?? 0)),
                    s.Available <= 0 ? "Critical" : s.Available <= s.Product.ReorderLevel ? "Low" : "Healthy")));
        }

        if (grain.Branch)
        {
            var levels = await db.BranchStockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Branch).ToListAsync(ct);
            rows.AddRange(levels
                .Where(s => s.Product is not null
                    && ReportFilters.Matches(branchId, s.BranchId)
                    && ReportFilters.Matches(categoryId, s.Product.CategoryId)
                    && ReportFilters.Matches(productId, s.ProductId)
                    // A warehouse filter is a statement about warehouse stock — branch rows can't
                    // satisfy it, so they drop out rather than ignoring the filter.
                    && !ReportFilters.Any(warehouseId))
                .Select(s => new InventoryReportRow(
                    s.ProductId, s.Product!.Sku, s.Product.NameEn, s.Product.Category?.NameEn ?? "",
                    "Branch", s.BranchId, s.Branch?.NameEn ?? "", s.Branch?.NameEn ?? "",
                    s.OnHand, s.Reserved, s.Available, s.Product.ReorderLevel, s.Product.CostPrice,
                    Math.Round(s.OnHand * s.Product.CostPrice, 2), Math.Round(s.OnHand * s.Product.SellingPrice, 2),
                    lastByBranch.GetValueOrDefault((s.ProductId, s.BranchId)),
                    s.Available <= 0 ? "Critical" : s.Available <= s.Product.ReorderLevel ? "Low" : "Healthy")));
        }

        if (!includeZeroStock) rows = rows.Where(r => r.OnHand != 0).ToList();
        if (ReportFilters.Any(stockStatus)) rows = rows.Where(r => ReportFilters.Matches(stockStatus, r.Status)).ToList();
        return Ok(rows.OrderBy(r => r.Sku).ThenBy(r => r.LocationType).ThenBy(r => r.Location).ToList());
    }

    // Low Stock — the same location grain as the Inventory report, narrowed to what's at or below
    // reorder level, with the replenishment arithmetic (shortfall, suggested order) already done.
    [HttpGet("low-stock")]
    public async Task<ActionResult<List<LowStockRow>>> LowStock(
        [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId, [FromQuery] int[]? categoryId,
        [FromQuery] int[]? productId, [FromQuery] int[]? supplierId, [FromQuery] string[]? locationType,
        [FromQuery] string[]? severity, CancellationToken ct = default)
    {
        var rows = new List<LowStockRow>();

        LowStockRow Build(Product p, string locType, int locId, string loc, string branch,
            decimal onHand, decimal reserved, decimal available)
        {
            // Restock to reorder level plus the configured reorder quantity — ordering only up to
            // the reorder level puts the SKU straight back into "Low" on the next sale.
            var shortfall = Math.Max(0, p.ReorderLevel - available);
            var suggested = Math.Max(shortfall, p.ReorderQty > 0 ? shortfall + p.ReorderQty : shortfall);
            return new LowStockRow(
                p.Id, p.Sku, p.NameEn, p.Category?.NameEn ?? "", locType, locId, loc, branch,
                onHand, reserved, available, p.ReorderLevel, p.ReorderQty,
                shortfall, suggested, p.Supplier?.NameEn, p.Supplier?.LeadTimeDays ?? 0,
                p.CostPrice, Math.Round(suggested * p.CostPrice, 2),
                available <= 0 ? "Critical" : "Low");
        }

        var grain = ReportFilters.LocationGrains(locationType, branchId, warehouseId);

        if (grain.Warehouse)
        {
            var levels = await db.StockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Product).ThenInclude(p => p!.Supplier)
                .Include(s => s.Warehouse).ThenInclude(w => w!.Branch).ToListAsync(ct);
            rows.AddRange(levels
                .Where(s => s.Product is not null && s.Available <= s.Product.ReorderLevel
                    && ReportFilters.Matches(warehouseId, s.WarehouseId)
                    && ReportFilters.Matches(categoryId, s.Product.CategoryId)
                    && ReportFilters.Matches(productId, s.ProductId)
                    && ReportFilters.Matches(supplierId, s.Product.SupplierId)
                    && (!ReportFilters.Any(branchId) || (s.Warehouse != null && branchId!.Contains(s.Warehouse.BranchId))))
                .Select(s => Build(s.Product!, "Warehouse", s.WarehouseId, s.Warehouse?.Name ?? "",
                    s.Warehouse?.Branch?.NameEn ?? "", s.OnHand, s.Reserved, s.Available)));
        }

        if (grain.Branch)
        {
            var levels = await db.BranchStockLevels.Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Product).ThenInclude(p => p!.Supplier)
                .Include(s => s.Branch).ToListAsync(ct);
            rows.AddRange(levels
                .Where(s => s.Product is not null && s.Available <= s.Product.ReorderLevel
                    && ReportFilters.Matches(branchId, s.BranchId)
                    && ReportFilters.Matches(categoryId, s.Product.CategoryId)
                    && ReportFilters.Matches(productId, s.ProductId)
                    && ReportFilters.Matches(supplierId, s.Product.SupplierId)
                    && !ReportFilters.Any(warehouseId))
                .Select(s => Build(s.Product!, "Branch", s.BranchId, s.Branch?.NameEn ?? "",
                    s.Branch?.NameEn ?? "", s.OnHand, s.Reserved, s.Available)));
        }

        if (ReportFilters.Any(severity)) rows = rows.Where(r => ReportFilters.Matches(severity, r.Status)).ToList();
        return Ok(rows.OrderBy(r => r.Available).ThenBy(r => r.Sku).ToList());
    }

    // Stock Count / reconciliation report — one row per posted or in-flight count, with the line
    // detail carried inline so the console can drill into exactly which SKUs drifted.
    [HttpGet("stock-count-variance")]
    public async Task<ActionResult<List<StockCountVarianceRow>>> StockCountVariance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId, [FromQuery] int[]? categoryId,
        [FromQuery] int[]? productId, [FromQuery] string[]? status, [FromQuery] string[]? scope,
        [FromQuery] bool varianceOnly = false, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var counts = await db.StockCounts
            .Include(c => c.Warehouse).ThenInclude(w => w!.Branch)
            .Include(c => c.Category)
            .Include(c => c.CountedBy).Include(c => c.ReviewedBy).Include(c => c.ApprovedBy).Include(c => c.RejectedBy)
            .Include(c => c.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(c => c.ScheduledFor >= f && c.ScheduledFor < t)
            .ToListAsync(ct);

        counts = counts.Where(c =>
            ReportFilters.Matches(warehouseId, c.WarehouseId)
            && (!ReportFilters.Any(branchId) || (c.Warehouse != null && branchId!.Contains(c.Warehouse.BranchId)))
            && ReportFilters.Matches(status, c.Status.ToString())
            && ReportFilters.Matches(scope, c.Scope.ToString())).ToList();

        var rows = counts.Select(c =>
        {
            var lines = c.Lines
                .Where(l => ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0)
                    && ReportFilters.Matches(productId, l.ProductId))
                .Where(l => !varianceOnly || l.Variance != 0)
                .OrderBy(l => l.Product?.Sku)
                .Select(l => new StockCountVarianceLine(
                    l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                    l.SystemQty, l.CountedQty, l.CountedQty is null ? 0 : l.Variance, l.UnitCost,
                    Math.Round(l.CountedQty is null ? 0 : l.VarianceValue, 2),
                    l.CountedQty is null ? "Uncounted" : l.Variance == 0 ? "Matched" : l.Variance > 0 ? "Overage" : "Shortage",
                    l.Note))
                .ToList();
            var counted = lines.Count(l => l.CountedQty is not null);
            var varianceLines = lines.Count(l => l.Variance != 0);
            return new StockCountVarianceRow(
                c.Id, c.CountNo, c.ScheduledFor, c.Warehouse?.Name ?? "", c.Warehouse?.Branch?.NameEn ?? "",
                c.Scope.ToString(), c.Category?.NameEn, c.Status.ToString(), c.CountedBy?.Name,
                c.ReviewedBy?.Name, c.ApprovedBy?.Name, c.RejectedBy?.Name, c.RejectionReason,
                lines.Count, counted, varianceLines,
                Math.Round(lines.Sum(l => l.Variance), 2),
                Math.Round(lines.Sum(l => l.VarianceValue), 2),
                Math.Round(lines.Sum(l => Math.Abs(l.VarianceValue)), 2),
                counted == 0 ? 100m : Math.Round((decimal)(counted - varianceLines) / counted * 100m, 2),
                lines);
        }).Where(r => r.Lines > 0).OrderByDescending(r => r.Date).ToList();

        return Ok(rows);
    }

    // Expiry / shelf-life exposure by batch.
    [HttpGet("expiry-report")]
    public async Task<ActionResult<List<ExpiryReportRow>>> ExpiryReport(
        [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId, [FromQuery] int[]? categoryId,
        [FromQuery] int[]? productId, [FromQuery] string[]? status, [FromQuery] int? withinDays,
        CancellationToken ct = default)
    {
        var batches = await db.StockBatches.Include(b => b.Product).ThenInclude(p => p!.Category)
            .Include(b => b.Warehouse).ThenInclude(w => w!.Branch).ToListAsync(ct);
        var today = DateTime.UtcNow.Date;

        var rows = batches
            .Where(b => b.Product is not null
                && ReportFilters.Matches(warehouseId, b.WarehouseId)
                && ReportFilters.Matches(categoryId, b.Product.CategoryId)
                && ReportFilters.Matches(productId, b.ProductId)
                && (!ReportFilters.Any(branchId) || (b.Warehouse != null && branchId!.Contains(b.Warehouse.BranchId))))
            .Select(b =>
            {
                var daysLeft = (int)(b.ExpiryDate.Date - today).TotalDays;
                var computed = b.ManualStatus?.ToString()
                    ?? (daysLeft < 0 ? "Expired" : daysLeft <= 7 ? "Critical" : daysLeft <= 30 ? "Expiring" : daysLeft <= 60 ? "Monitor" : "Healthy");
                return new ExpiryReportRow(
                    b.Id, b.Product!.Sku, b.Product.NameEn, b.Product.Category?.NameEn ?? "",
                    b.Warehouse?.Name ?? "", b.Warehouse?.Branch?.NameEn ?? "", b.BatchNo,
                    b.ReceivedDate, b.ExpiryDate, daysLeft, b.Qty, b.Product.CostPrice,
                    Math.Round(b.Qty * b.Product.CostPrice, 2), computed);
            })
            .Where(r => withinDays is null || r.DaysLeft <= withinDays)
            .Where(r => ReportFilters.Matches(status, r.Status))
            .OrderBy(r => r.DaysLeft)
            .ToList();

        return Ok(rows);
    }
}

// ————————————————————————— Procurement reports —————————————————————————

public record PurchaseOrderReportLine(
    string Sku, string Product, string Category, string Branch, string? Warehouse, string Uom,
    decimal Qty, decimal ReceivedQty, decimal PendingQty, decimal UnitCost, decimal LineTotal, string? BatchNo, DateTime? ExpiryDate);
public record PurchaseOrderReportRow(
    int Id, string PoNo, DateTime OrderedAt, DateTime ExpectedDate, string Supplier, string Status,
    string Currency, string Branches, string? Carrier, string? TrackingRef, string? ApprovedBy,
    int ItemCount, decimal QtyOrdered, decimal QtyReceived, decimal QtyPending, decimal ReceivedPct,
    decimal SubTotal, decimal Shipping, decimal Total, int DaysLate,
    IReadOnlyList<PurchaseOrderReportLine> Items);

public record SupplierReturnReportLine(
    string Sku, string Product, string Category, decimal Qty, decimal UnitCost, decimal LineValue, string? BatchNo);
public record SupplierReturnReportRow(
    int Id, string RtsNo, DateTime Date, string Supplier, string Branch, string Warehouse, string? LinkedPo,
    string Reason, string Status, string? CreditNoteRef, string? Carrier,
    int ItemCount, decimal Qty, decimal Value, IReadOnlyList<SupplierReturnReportLine> Items);

public record SupplierPerformanceRow(
    int SupplierId, string Supplier, string Type, string Terms, int LeadTimeDays,
    int PoCount, decimal OrderedValue, decimal ReceivedValue, decimal FillRatePct, decimal OnTimePct,
    decimal AvgLeadTimeDays, int ReturnCount, decimal ReturnedValue, decimal ReturnRatePct, decimal Outstanding);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class ProcurementReportsController(AppDbContext db) : ReportControllerBase
{
    [HttpGet("purchase-orders")]
    public async Task<ActionResult<List<PurchaseOrderReportRow>>> PurchaseOrders(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? supplierId, [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId,
        [FromQuery] int[]? productId, [FromQuery] int[]? categoryId, [FromQuery] string[]? status,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var orders = await db.PurchaseOrders
            .Include(p => p.Supplier)
            .Include(p => p.Lines).ThenInclude(l => l.Product).ThenInclude(pr => pr!.Category)
            .Include(p => p.Lines).ThenInclude(l => l.Branch)
            .Include(p => p.Lines).ThenInclude(l => l.Warehouse)
            .Where(p => p.CreatedAt >= f && p.CreatedAt < t)
            .ToListAsync(ct);

        var approverIds = orders.Where(o => o.ApproverUserId is not null).Select(o => o.ApproverUserId!.Value).Distinct().ToList();
        var approvers = await db.Users.Where(u => approverIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        var today = DateTime.UtcNow.Date;
        var rows = orders
            .Where(o => ReportFilters.Matches(supplierId, o.SupplierId)
                && ReportFilters.Matches(status, o.Status.ToString()))
            .Select(o =>
            {
                var lines = o.Lines.Where(l =>
                    ReportFilters.Matches(branchId, l.BranchId)
                    && ReportFilters.Matches(warehouseId, l.WarehouseId)
                    && ReportFilters.Matches(productId, l.ProductId)
                    && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0)).ToList();
                var subTotal = lines.Sum(l => l.Qty * l.UnitCost);
                var qtyOrdered = lines.Sum(l => l.Qty);
                var qtyReceived = lines.Sum(l => l.ReceivedQty);
                // A PO that's still open past its expected date is late; a closed one never is,
                // however long it took (the received date is the truth for those).
                var open = o.Status is not (PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled);
                return new PurchaseOrderReportRow(
                    o.Id, o.PoNo, o.CreatedAt, o.ExpectedDate, o.Supplier?.NameEn ?? "", o.Status.ToString(),
                    o.Currency,
                    string.Join(", ", lines.Select(l => l.Branch?.NameEn ?? "").Where(b => b != "").Distinct()),
                    o.Carrier, o.TrackingRef,
                    o.ApproverUserId is not null && approvers.TryGetValue(o.ApproverUserId.Value, out var n) ? n : null,
                    lines.Count, Math.Round(qtyOrdered, 2), Math.Round(qtyReceived, 2),
                    Math.Round(Math.Max(0, qtyOrdered - qtyReceived), 2),
                    qtyOrdered > 0 ? Math.Round(qtyReceived / qtyOrdered * 100, 2) : 0,
                    Math.Round(subTotal, 2), Math.Round(o.Shipping, 2), Math.Round(subTotal + o.Shipping, 2),
                    open && o.ExpectedDate.Date < today ? (int)(today - o.ExpectedDate.Date).TotalDays : 0,
                    lines.Select(l => new PurchaseOrderReportLine(
                        l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                        l.Branch?.NameEn ?? "", l.Warehouse?.Name, l.Uom,
                        l.Qty, l.ReceivedQty, Math.Max(0, l.Qty - l.ReceivedQty), l.UnitCost,
                        Math.Round(l.Qty * l.UnitCost, 2), l.BatchNo, l.ExpiryDate)).ToList());
            })
            .Where(r => r.ItemCount > 0)
            .OrderByDescending(r => r.OrderedAt)
            .ToList();

        return Ok(rows);
    }

    // Supplier Returns (RTS). Filters on ReturnToSupplier.Date — the business date the goods went
    // back, not the row's CreatedAt — with the exclusive upper bound that makes "to = today"
    // actually include today.
    [HttpGet("supplier-returns")]
    public async Task<ActionResult<List<SupplierReturnReportRow>>> SupplierReturns(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? supplierId, [FromQuery] int[]? branchId, [FromQuery] int[]? warehouseId,
        [FromQuery] int[]? productId, [FromQuery] int[]? categoryId, [FromQuery] string[]? status,
        [FromQuery] string[]? reason, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var returns = await db.ReturnToSuppliers
            .Include(r => r.Supplier).Include(r => r.Branch).Include(r => r.Warehouse).Include(r => r.PurchaseOrder)
            .Include(r => r.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(r => r.Date >= f && r.Date < t)
            .ToListAsync(ct);

        var rows = returns
            .Where(r => ReportFilters.Matches(supplierId, r.SupplierId)
                && ReportFilters.Matches(branchId, r.BranchId)
                && ReportFilters.Matches(warehouseId, r.WarehouseId)
                && ReportFilters.Matches(status, r.Status.ToString())
                && ReportFilters.Matches(reason, r.Reason))
            .Select(r =>
            {
                var lines = r.Lines.Where(l =>
                    ReportFilters.Matches(productId, l.ProductId)
                    && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0)).ToList();
                return new SupplierReturnReportRow(
                    r.Id, r.RtsNo, r.Date, r.Supplier?.NameEn ?? "", r.Branch?.NameEn ?? "", r.Warehouse?.Name ?? "",
                    r.PurchaseOrder?.PoNo, r.Reason, r.Status.ToString(), r.CreditNoteRef, r.Carrier,
                    lines.Count, Math.Round(lines.Sum(l => l.Qty), 2), Math.Round(lines.Sum(l => l.Qty * l.UnitCost), 2),
                    lines.Select(l => new SupplierReturnReportLine(
                        l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                        l.Qty, l.UnitCost, Math.Round(l.Qty * l.UnitCost, 2), l.BatchNo)).ToList());
            })
            .Where(r => r.ItemCount > 0)
            .OrderByDescending(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    [HttpGet("supplier-performance")]
    public async Task<ActionResult<List<SupplierPerformanceRow>>> SupplierPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? supplierId,
        [FromQuery] int[]? branchId, [FromQuery] string[]? supplierType,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 180);
        var suppliers = await db.Suppliers.ToListAsync(ct);
        suppliers = suppliers.Where(s => ReportFilters.Matches(supplierId, s.Id)
            && ReportFilters.Matches(supplierType, s.Type.ToString())).ToList();
        var ids = suppliers.Select(s => s.Id).ToHashSet();

        var orders = await db.PurchaseOrders.Include(p => p.Lines)
            .Where(p => p.CreatedAt >= f && p.CreatedAt < t && ids.Contains(p.SupplierId)).ToListAsync(ct);
        var returns = await db.ReturnToSuppliers.Include(r => r.Lines)
            .Where(r => r.Date >= f && r.Date < t && ids.Contains(r.SupplierId)).ToListAsync(ct);

        // A branch filter on a supplier scorecard means "the POs this branch raised" — the PO's
        // branch lives on its lines, so an order counts if any line was destined for that branch.
        if (ReportFilters.Any(branchId))
        {
            orders = orders.Where(o => o.Lines.Any(l => ReportFilters.Matches(branchId, l.BranchId))).ToList();
            returns = returns.Where(r => ReportFilters.Matches(branchId, r.BranchId)).ToList();
        }

        var byOrder = orders.GroupBy(o => o.SupplierId).ToDictionary(g => g.Key, g => g.ToList());
        var byReturn = returns.GroupBy(r => r.SupplierId).ToDictionary(g => g.Key, g => g.ToList());

        var rows = suppliers.Select(s =>
        {
            var pos = byOrder.GetValueOrDefault(s.Id, []);
            var rts = byReturn.GetValueOrDefault(s.Id, []);
            var ordered = pos.Sum(o => o.Lines.Sum(l => l.Qty * l.UnitCost));
            var received = pos.Sum(o => o.Lines.Sum(l => l.ReceivedQty * l.UnitCost));
            var qtyOrdered = pos.Sum(o => o.Lines.Sum(l => l.Qty));
            var qtyReceived = pos.Sum(o => o.Lines.Sum(l => l.ReceivedQty));
            var closed = pos.Where(o => o.Status == PurchaseOrderStatus.Received).ToList();
            // "On time" is measured on closed POs only — an open PO hasn't succeeded or failed yet.
            var onTime = closed.Count(o => o.UpdatedAt.Date <= o.ExpectedDate.Date);
            var returnedValue = rts.Sum(r => r.Lines.Sum(l => l.Qty * l.UnitCost));
            return new SupplierPerformanceRow(
                s.Id, s.NameEn, s.Type, s.Terms, s.LeadTimeDays,
                pos.Count, Math.Round(ordered, 2), Math.Round(received, 2),
                qtyOrdered > 0 ? Math.Round(qtyReceived / qtyOrdered * 100, 2) : 0,
                closed.Count > 0 ? Math.Round((decimal)onTime / closed.Count * 100, 2) : 0,
                closed.Count > 0 ? Math.Round((decimal)closed.Average(o => (o.UpdatedAt.Date - o.CreatedAt.Date).TotalDays), 1) : 0,
                rts.Count, Math.Round(returnedValue, 2),
                received > 0 ? Math.Round(returnedValue / received * 100, 2) : 0,
                0);
        }).Where(r => r.PoCount > 0 || r.ReturnCount > 0).OrderByDescending(r => r.OrderedValue).ToList();

        return Ok(rows);
    }
}

// ————————————————————————— Returns, damage, people & margin —————————————————————————

public record CustomerReturnReportLine(
    string Sku, string Product, string Category, decimal Qty, decimal UnitPricePaid, decimal VatRate, decimal Amount);
public record CustomerReturnReportRow(
    int Id, string ReturnNo, DateTime Date, string Type, string? OrderNo, string? Customer, string Branch,
    string? ApprovedBy, string Reason, string? DamageReason, string RefundMethod, string Status, string? DgrnNo,
    int ItemCount, decimal Qty, decimal GrossRefund, decimal VatReversal, decimal RestockingFee, decimal NetCashback,
    IReadOnlyList<CustomerReturnReportLine> Items);

public record DamagedItemReportRow(
    int ReturnId, string ReturnNo, string? DgrnNo, DateTime Date, string Sku, string Product, string Category,
    string Branch, string? Customer, decimal Qty, decimal UnitCost, decimal LossValue, string DamageReason,
    string? Notes, string? PhotoReference, string? ApprovedBy, string Status);

public record SurplusReturnReportRow(
    int ReturnId, string ReturnNo, DateTime Date, string? OrderNo, DateTime? SoldAt, int? DaysHeld,
    string Sku, string Product, string Category, string Uom, string Branch, string? Customer,
    decimal Qty, decimal UnitPricePaid, decimal RefundAmount, decimal UnitCost, decimal RestockValue,
    decimal RestockingFeePct, decimal RestockingFee, decimal NetCashback, string RefundMethod,
    string Reason, string? ApprovedBy, string Status);

public record EmployeeAuditRow(
    int Id, DateTime Date, string? UserName, string? EmployeeName, string? Department, string? Designation,
    string? Branch, string Module, string Event, string? RecordId, string? OldValue, string? NewValue,
    string? Reason, string Severity, string? Device);

public record CashierPerformanceRow(
    int UserId, string Cashier, string Branch, int Orders, decimal Gross, decimal Discounts, decimal Vat,
    decimal Net, decimal AvgBasket, decimal ItemsPerOrder, int VoidedOrders, decimal DiscountRatePct,
    int Refunds, decimal RefundValue);

public record ProfitMarginRow(
    string Key, string Label, string? Sub, decimal UnitsSold, decimal Revenue, decimal Cogs,
    decimal GrossProfit, decimal MarginPct, decimal Discounts, decimal Returns, decimal NetProfit);

public record PaymentMethodReportRow(
    string Method, int Transactions, decimal Amount, decimal SharePct, int Refunds, decimal RefundAmount, decimal Net);

public record CategoryPerformanceRow(
    int CategoryId, string Category, int SkuCount, decimal UnitsSold, decimal Revenue, decimal Cogs,
    decimal GrossProfit, decimal MarginPct, decimal ReturnedUnits, decimal ReturnRatePct,
    decimal OnHand, decimal StockValue);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class OperationsReportsController(AppDbContext db) : ReportControllerBase
{
    [HttpGet("customer-returns")]
    public async Task<ActionResult<List<CustomerReturnReportRow>>> CustomerReturns(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? customerId, [FromQuery] int[]? productId,
        [FromQuery] int[]? categoryId, [FromQuery] string[]? type, [FromQuery] string[]? status,
        [FromQuery] string[]? refundMethod, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var returns = await db.Returns
            .Include(r => r.Order).ThenInclude(o => o!.Branch)
            .Include(r => r.Customer).Include(r => r.ApprovedBy)
            .Include(r => r.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(r => r.CreatedAt >= f && r.CreatedAt < t)
            .ToListAsync(ct);

        var rows = returns
            .Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)
                && ReportFilters.Matches(customerId, r.CustomerId)
                && ReportFilters.Matches(type, r.Type.ToString())
                && ReportFilters.Matches(status, r.Status.ToString())
                && ReportFilters.Matches(refundMethod, r.RefundMethod))
            .Select(r =>
            {
                var lines = r.Lines.Where(l =>
                    ReportFilters.Matches(productId, l.ProductId)
                    && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0)).ToList();
                return new CustomerReturnReportRow(
                    r.Id, r.ReturnNo, r.CreatedAt, r.Type.ToString(), r.Order?.OrderNo, r.Customer?.NameEn,
                    r.Order?.Branch?.NameEn ?? "", r.ApprovedBy?.Name, r.Reason, r.DamageReason?.ToString(),
                    r.RefundMethod, r.Status.ToString(), r.DgrnNo,
                    lines.Count, Math.Round(lines.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty), 2),
                    Math.Round(r.GrossRefund, 2), Math.Round(r.VatReversal, 2),
                    Math.Round(r.RestockingFeeAmount, 2),
                    // Legacy rows predate the frozen NetCashback field; fall back to the line sum.
                    Math.Round(r.NetCashback > 0 ? r.NetCashback : lines.Sum(l => l.Amount), 2),
                    lines.Select(l => new CustomerReturnReportLine(
                        l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                        l.StockQty > 0 ? l.StockQty : l.Qty, l.UnitPricePaid, l.VatRate, Math.Round(l.Amount, 2))).ToList());
            })
            .Where(r => r.ItemCount > 0)
            .OrderByDescending(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    // Damaged Items — line-level, because the loss is a per-SKU quantity and value, not a per-ticket
    // one. Sourced from Damaged-type returns (BRD §3.2.2 DGRN workflow).
    [HttpGet("damaged-items")]
    public async Task<ActionResult<List<DamagedItemReportRow>>> DamagedItems(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? productId, [FromQuery] int[]? categoryId,
        [FromQuery] string[]? damageReason, [FromQuery] string[]? status, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var returns = await db.Returns
            .Include(r => r.Order).ThenInclude(o => o!.Branch)
            .Include(r => r.Customer).Include(r => r.ApprovedBy)
            .Include(r => r.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(r => r.Type == ReturnType.Damaged && r.CreatedAt >= f && r.CreatedAt < t)
            .ToListAsync(ct);

        var rows = returns
            .Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)
                && ReportFilters.Matches(status, r.Status.ToString())
                && ReportFilters.Matches(damageReason, r.DamageReason?.ToString()))
            .SelectMany(r => r.Lines
                .Where(l => ReportFilters.Matches(productId, l.ProductId)
                    && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0))
                .Select(l =>
                {
                    var qty = l.StockQty > 0 ? l.StockQty : l.Qty;
                    return new DamagedItemReportRow(
                        r.Id, r.ReturnNo, r.DgrnNo, r.CreatedAt, l.Product?.Sku ?? "", l.Product?.NameEn ?? "",
                        l.Product?.Category?.NameEn ?? "", r.Order?.Branch?.NameEn ?? "", r.Customer?.NameEn,
                        qty, l.Product?.CostPrice ?? 0, Math.Round(qty * (l.Product?.CostPrice ?? 0), 2),
                        r.DamageReason?.ToString() ?? "Unspecified", r.Reason, r.PhotoReference,
                        r.ApprovedBy?.Name, r.Status.ToString());
                }))
            .OrderByDescending(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    // Surplus Inventory Returns (BRD §3.2.3) — unused material a contractor brings back, which goes
    // straight back into sellable stock rather than into quarantine like a damaged return. Line-level,
    // because the interesting figures are per-SKU: how much stock came back, what it is worth at cost
    // sitting back on the shelf, and what the restocking fee recovered against it.
    //
    // The restocking fee is withheld per TICKET, so it is apportioned across the ticket's lines by
    // their share of the refund — a per-line fee column that repeated the whole ticket fee on every
    // row would sum to several times the fee actually collected.
    [HttpGet("surplus-returns")]
    public async Task<ActionResult<List<SurplusReturnReportRow>>> SurplusReturns(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? customerId, [FromQuery] int[]? productId,
        [FromQuery] int[]? categoryId, [FromQuery] string[]? status, [FromQuery] string[]? refundMethod,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to, 90);
        var returns = await db.Returns
            .Include(r => r.Order).ThenInclude(o => o!.Branch)
            .Include(r => r.Customer).Include(r => r.ApprovedBy)
            .Include(r => r.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(r => r.Type == ReturnType.Surplus && r.CreatedAt >= f && r.CreatedAt < t)
            .ToListAsync(ct);

        var rows = returns
            .Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)
                && ReportFilters.Matches(customerId, r.CustomerId)
                && ReportFilters.Matches(status, r.Status.ToString())
                && ReportFilters.Matches(refundMethod, r.RefundMethod))
            .SelectMany(r =>
            {
                var refundBase = r.Lines.Sum(l => l.Amount);
                return r.Lines
                    .Where(l => ReportFilters.Matches(productId, l.ProductId)
                        && ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0))
                    .Select(l =>
                    {
                        var qty = l.StockQty > 0 ? l.StockQty : l.Qty;
                        var cost = l.Product?.CostPrice ?? 0;
                        var share = refundBase == 0 ? 0 : l.Amount / refundBase;
                        var soldAt = r.Order?.CreatedAt;
                        return new SurplusReturnReportRow(
                            r.Id, r.ReturnNo, r.CreatedAt, r.Order?.OrderNo, soldAt,
                            soldAt is null ? null : (int)(r.CreatedAt - soldAt.Value).TotalDays,
                            l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Product?.Category?.NameEn ?? "",
                            l.Product?.StockUom ?? "", r.Order?.Branch?.NameEn ?? "", r.Customer?.NameEn,
                            qty, l.UnitPricePaid, Math.Round(l.Amount, 2),
                            cost, Math.Round(qty * cost, 2),
                            r.RestockingFeePct, Math.Round(r.RestockingFeeAmount * share, 2),
                            Math.Round((r.NetCashback > 0 ? r.NetCashback : refundBase) * share, 2),
                            r.RefundMethod, r.Reason, r.ApprovedBy?.Name, r.Status.ToString());
                    });
            })
            .OrderByDescending(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    // Employee Audit — the AuditLog stream resolved against Users/Employees/Devices so it reads as
    // "who did what, where", rather than raw ids.
    [HttpGet("employee-audit")]
    public async Task<ActionResult<List<EmployeeAuditRow>>> EmployeeAudit(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? userId, [FromQuery] int[]? employeeId, [FromQuery] int[]? branchId,
        [FromQuery] string[]? module, [FromQuery] string[]? @event, [FromQuery] string[]? severity,
        [FromQuery] string? search, [FromQuery] int take = 1000, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var query = db.AuditLogs.Where(a => a.CreatedAt >= f && a.CreatedAt < t);
        if (ReportFilters.Any(userId))
        {
            var ids = ReportFilters.ForSql(userId);
            query = query.Where(a => a.UserId != null && ids.Contains(a.UserId.Value));
        }
        if (ReportFilters.Any(employeeId))
        {
            var ids = ReportFilters.ForSql(employeeId);
            query = query.Where(a => a.EmployeeId != null && ids.Contains(a.EmployeeId.Value));
        }
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            query = query.Where(a => a.BranchId != null && ids.Contains(a.BranchId.Value));
        }
        if (ReportFilters.Any(module))
        {
            var names = ReportFilters.ForSql(module);
            query = query.Where(a => names.Contains(a.Module));
        }
        if (ReportFilters.Any(@event))
        {
            var names = ReportFilters.ForSql(@event);
            query = query.Where(a => names.Contains(a.Event));
        }
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a => a.Event.Contains(search) || (a.UserName != null && a.UserName.Contains(search))
                || (a.RecordId != null && a.RecordId.Contains(search)) || (a.Reason != null && a.Reason.Contains(search)));

        var logs = await query.OrderByDescending(a => a.CreatedAt).Take(Math.Clamp(take, 1, 10_000)).ToListAsync(ct);
        if (ReportFilters.Any(severity)) logs = logs.Where(a => ReportFilters.Matches(severity, a.Severity.ToString())).ToList();

        var empIds = logs.Where(a => a.EmployeeId is not null).Select(a => a.EmployeeId!.Value).Distinct().ToList();
        var userIds = logs.Where(a => a.UserId is not null).Select(a => a.UserId!.Value).Distinct().ToList();
        var branchIds = logs.Where(a => a.BranchId is not null).Select(a => a.BranchId!.Value).Distinct().ToList();
        var deviceIds = logs.Where(a => a.DeviceId is not null).Select(a => a.DeviceId!.Value).Distinct().ToList();

        var employees = await db.Employees.Include(e => e.Department)
            .Where(e => empIds.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);
        // A log row may carry only a UserId; the employee record is still the source of
        // department/designation, so resolve that link too.
        var employeesByUser = await db.Employees.Include(e => e.Department)
            .Where(e => e.UserId != null && userIds.Contains(e.UserId.Value))
            .ToDictionaryAsync(e => e.UserId!.Value, ct);
        var users = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var branches = await db.Branches.Where(b => branchIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.NameEn, ct);
        var devices = await db.Devices.Where(d => deviceIds.Contains(d.Id)).ToDictionaryAsync(d => d.Id, d => d.DeviceCode, ct);

        var rows = logs.Select(a =>
        {
            Employee? emp = null;
            if (a.EmployeeId is not null) employees.TryGetValue(a.EmployeeId.Value, out emp);
            if (emp is null && a.UserId is not null) employeesByUser.TryGetValue(a.UserId.Value, out emp);
            return new EmployeeAuditRow(
                a.Id, a.CreatedAt,
                a.UserName ?? (a.UserId is not null && users.TryGetValue(a.UserId.Value, out var un) ? un : null),
                emp is null ? null : $"{emp.FirstName} {emp.LastName}".Trim(),
                emp?.Department?.Name, emp?.Designation,
                a.BranchId is not null && branches.TryGetValue(a.BranchId.Value, out var bn) ? bn : null,
                a.Module, a.Event, a.RecordId, Truncate(a.OldValue), Truncate(a.NewValue), a.Reason,
                a.Severity.ToString(),
                a.DeviceId is not null && devices.TryGetValue(a.DeviceId.Value, out var dn) ? dn : null);
        }).ToList();

        return Ok(rows);
    }

    // Old/new values are whole JSON documents; a report table needs a readable cell, and the full
    // payload is still one click away in the Audit Logs page.
    private static string? Truncate(string? value) =>
        value is null ? null : value.Length <= 240 ? value : value[..240] + "…";

    [HttpGet("cashier-performance")]
    public async Task<ActionResult<List<CashierPerformanceRow>>> CashierPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? userId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await db.Orders.Include(o => o.Lines).Include(o => o.Cashier).Include(o => o.Branch)
            .Where(o => o.CreatedAt >= f && o.CreatedAt < t).ToListAsync(ct);
        orders = orders.Where(o => ReportFilters.Matches(branchId, o.BranchId)
            && ReportFilters.Matches(userId, o.CashierUserId)).ToList();

        var refunds = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);

        var rows = orders.GroupBy(o => o.CashierUserId).Select(g =>
        {
            var completed = g.Where(o => o.Status != OrderStatus.Voided).ToList();
            var gross = completed.Sum(o => o.SubTotal);
            var cashierRefunds = refunds.Where(r => r.Order?.CashierUserId == g.Key).ToList();
            return new CashierPerformanceRow(
                g.Key, g.First().Cashier?.Name ?? $"User {g.Key}",
                string.Join(", ", g.Select(o => o.Branch?.NameEn ?? "").Where(b => b != "").Distinct()),
                completed.Count, Math.Round(gross, 2), Math.Round(completed.Sum(o => o.DiscountTotal), 2),
                Math.Round(completed.Sum(o => o.VatTotal), 2), Math.Round(completed.Sum(o => o.GrandTotal), 2),
                completed.Count > 0 ? Math.Round(completed.Sum(o => o.GrandTotal) / completed.Count, 2) : 0,
                completed.Count > 0 ? Math.Round((decimal)completed.Sum(o => o.Lines.Count) / completed.Count, 2) : 0,
                g.Count(o => o.Status == OrderStatus.Voided),
                gross > 0 ? Math.Round(completed.Sum(o => o.DiscountTotal) / gross * 100, 2) : 0,
                cashierRefunds.Count, Math.Round(cashierRefunds.Sum(r => r.NetCashback), 2));
        }).OrderByDescending(r => r.Net).ToList();

        return Ok(rows);
    }

    [HttpGet("profit-margin")]
    public async Task<ActionResult<List<ProfitMarginRow>>> ProfitMargin(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? categoryId, [FromQuery] int[]? productId,
        [FromQuery] string groupBy = "product", CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var lines = await db.OrderLines.Include(l => l.Order)
            .Include(l => l.Product).ThenInclude(p => p!.Category)
            .Where(l => l.Order!.Status != OrderStatus.Voided && l.Order.CreatedAt >= f && l.Order.CreatedAt < t)
            .ToListAsync(ct);
        lines = lines.Where(l => l.Product is not null
            && ReportFilters.Matches(branchId, l.Order!.BranchId)
            && ReportFilters.Matches(categoryId, l.Product.CategoryId)
            && ReportFilters.Matches(productId, l.ProductId)).ToList();

        var returnLines = await db.ReturnLines.Include(l => l.Return).ThenInclude(r => r!.Order)
            .Where(l => l.Return!.CreatedAt >= f && l.Return.CreatedAt < t).ToListAsync(ct);

        IEnumerable<IGrouping<string, OrderLine>> groups = groupBy.ToLowerInvariant() switch
        {
            "category" => lines.GroupBy(l => $"cat:{l.Product!.CategoryId}"),
            "branch" => lines.GroupBy(l => $"branch:{l.Order!.BranchId}"),
            _ => lines.GroupBy(l => $"product:{l.ProductId}"),
        };

        var rows = groups.Select(g =>
        {
            var first = g.First();
            var (label, sub) = groupBy.ToLowerInvariant() switch
            {
                "category" => (first.Product!.Category?.NameEn ?? "Uncategorised", (string?)null),
                "branch" => (first.Order!.Branch?.NameEn ?? $"Branch {first.Order.BranchId}", (string?)null),
                _ => (first.Product!.NameEn, (string?)first.Product.Sku),
            };
            var units = g.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty);
            var revenue = g.Sum(l => l.LineTotal);
            var cogs = g.Sum(l => (l.StockQty > 0 ? l.StockQty : l.Qty) * (l.Product?.CostPrice ?? 0));
            var productIds = g.Select(l => l.ProductId).ToHashSet();
            var returned = returnLines.Where(rl => productIds.Contains(rl.ProductId)).Sum(rl => rl.Amount);
            var discounts = g.Sum(l => l.UnitPrice * (l.StockQty > 0 ? l.StockQty : l.Qty) - l.LineTotal);
            return new ProfitMarginRow(
                g.Key, label, sub, Math.Round(units, 2), Math.Round(revenue, 2), Math.Round(cogs, 2),
                Math.Round(revenue - cogs, 2), revenue > 0 ? Math.Round((revenue - cogs) / revenue * 100, 2) : 0,
                Math.Round(Math.Max(0, discounts), 2), Math.Round(returned, 2),
                Math.Round(revenue - cogs - returned, 2));
        }).OrderByDescending(r => r.GrossProfit).ToList();

        return Ok(rows);
    }

    [HttpGet("payment-methods")]
    public async Task<ActionResult<List<PaymentMethodReportRow>>> PaymentMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] string[]? method, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await db.Orders.Include(o => o.Payments)
            .Where(o => o.Status != OrderStatus.Voided && o.CreatedAt >= f && o.CreatedAt < t).ToListAsync(ct);
        orders = orders.Where(o => ReportFilters.Matches(branchId, o.BranchId)).ToList();

        var refunds = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);
        refunds = refunds.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)).ToList();

        var payments = orders.SelectMany(o => o.Payments).ToList();
        var total = payments.Sum(p => p.Amount);

        var rows = payments.GroupBy(p => p.Method.ToString()).Select(g =>
        {
            // "Original" refunds fan back out across the order's own methods, so they can't be
            // attributed to a single method here — only explicitly-chosen methods are matched.
            var methodRefunds = refunds.Where(r => string.Equals(r.RefundMethod, g.Key, StringComparison.OrdinalIgnoreCase)).ToList();
            var amount = g.Sum(p => p.Amount);
            var refundAmount = methodRefunds.Sum(r => r.NetCashback);
            return new PaymentMethodReportRow(
                g.Key, g.Count(), Math.Round(amount, 2),
                total > 0 ? Math.Round(amount / total * 100, 2) : 0,
                methodRefunds.Count, Math.Round(refundAmount, 2), Math.Round(amount - refundAmount, 2));
        }).Where(r => ReportFilters.Matches(method, r.Method)).OrderByDescending(r => r.Amount).ToList();

        return Ok(rows);
    }

    [HttpGet("category-performance")]
    public async Task<ActionResult<List<CategoryPerformanceRow>>> CategoryPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int[]? branchId, [FromQuery] int[]? categoryId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var categories = await db.Categories.ToListAsync(ct);
        categories = categories.Where(c => ReportFilters.Matches(categoryId, c.Id)).ToList();
        var catIds = categories.Select(c => c.Id).ToHashSet();

        var products = await db.Products.Where(p => catIds.Contains(p.CategoryId)).ToListAsync(ct);
        var productCategory = products.ToDictionary(p => p.Id, p => p.CategoryId);
        var productCost = products.ToDictionary(p => p.Id, p => p.CostPrice);

        var lines = await db.OrderLines.Include(l => l.Order)
            .Where(l => l.Order!.Status != OrderStatus.Voided && l.Order.CreatedAt >= f && l.Order.CreatedAt < t)
            .ToListAsync(ct);
        lines = lines.Where(l => productCategory.ContainsKey(l.ProductId)
            && ReportFilters.Matches(branchId, l.Order!.BranchId)).ToList();

        var returnLines = await db.ReturnLines.Include(l => l.Return).ThenInclude(r => r!.Order)
            .Where(l => l.Return!.CreatedAt >= f && l.Return.CreatedAt < t).ToListAsync(ct);
        returnLines = returnLines.Where(l => productCategory.ContainsKey(l.ProductId)
            && ReportFilters.Matches(branchId, l.Return?.Order?.BranchId)).ToList();

        var branchStock = await db.BranchStockLevels.ToListAsync(ct);
        branchStock = branchStock.Where(s => productCategory.ContainsKey(s.ProductId)
            && ReportFilters.Matches(branchId, s.BranchId)).ToList();

        var rows = categories.Select(c =>
        {
            var catProducts = products.Where(p => p.CategoryId == c.Id).Select(p => p.Id).ToHashSet();
            var catLines = lines.Where(l => catProducts.Contains(l.ProductId)).ToList();
            var units = catLines.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty);
            var revenue = catLines.Sum(l => l.LineTotal);
            var cogs = catLines.Sum(l => (l.StockQty > 0 ? l.StockQty : l.Qty) * productCost.GetValueOrDefault(l.ProductId));
            var returnedUnits = returnLines.Where(l => catProducts.Contains(l.ProductId))
                .Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty);
            var stock = branchStock.Where(s => catProducts.Contains(s.ProductId)).ToList();
            return new CategoryPerformanceRow(
                c.Id, c.NameEn, catProducts.Count, Math.Round(units, 2), Math.Round(revenue, 2), Math.Round(cogs, 2),
                Math.Round(revenue - cogs, 2), revenue > 0 ? Math.Round((revenue - cogs) / revenue * 100, 2) : 0,
                Math.Round(returnedUnits, 2), units > 0 ? Math.Round(returnedUnits / units * 100, 2) : 0,
                Math.Round(stock.Sum(s => s.OnHand), 2),
                Math.Round(stock.Sum(s => s.OnHand * productCost.GetValueOrDefault(s.ProductId)), 2));
        }).OrderByDescending(r => r.Revenue).ToList();

        return Ok(rows);
    }
}
