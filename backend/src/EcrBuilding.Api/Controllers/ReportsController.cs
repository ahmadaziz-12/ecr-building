using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Module 12 (BRD §11) — real report endpoints computed from live data, replacing the decorative
// report-definition registry rows. Everything here is a pure aggregation; export to CSV happens
// client-side with the existing exportToCsv pattern. Server-side PDF/Excel rendering and scheduled
// email delivery are deferred (they need a rendering-library licensing decision and an email
// provider — both flagged as external dependencies the owner chose to skip for now).
public record SalesByMethodRow(string Method, decimal Amount, int Count, decimal SharePct, decimal Refunded, decimal Net);
public record SalesByCashierRow(string Cashier, string Branch, decimal Amount, int Orders, decimal Discounts, decimal AvgBasket, int Voids);
public record SalesByBranchRow(string Branch, int Orders, decimal Gross, decimal Discounts, decimal Vat, decimal Net, decimal Cogs, decimal GrossProfit, decimal MarginPct, decimal AvgBasket);
public record SalesByDayRow(DateTime Date, int Orders, decimal Gross, decimal Discounts, decimal Net, decimal GrossProfit);
public record SalesByCategoryRow(string Category, decimal Units, decimal Revenue, decimal Cogs, decimal GrossProfit, decimal MarginPct, decimal SharePct);
public record SalesSummaryDto(
    decimal GrossSales, decimal Discounts, decimal Vat, decimal Fees, decimal NetSales, int OrderCount,
    decimal ItemsSold, decimal AvgBasket, decimal Cogs, decimal GrossProfit, decimal MarginPct,
    int ReturnCount, decimal RefundValue, decimal NetAfterReturns, int UniqueCustomers, int VoidedOrders,
    IReadOnlyList<SalesByMethodRow> ByMethod, IReadOnlyList<SalesByCashierRow> ByCashier,
    IReadOnlyList<SalesByBranchRow> ByBranch, IReadOnlyList<SalesByDayRow> ByDay,
    IReadOnlyList<SalesByCategoryRow> ByCategory);
public record ReturnsAnalysisRow(string Type, int Count, decimal GrossRefund, decimal VatReversed, decimal RestockingFees, decimal NetCashback);
public record RefundMethodRow(string Method, int Count, decimal Amount);
public record VatByRateRow(decimal Rate, decimal TaxableAmount, decimal VatCollected);
public record VatReportDto(IReadOnlyList<VatByRateRow> Collected, decimal TotalCollected, decimal TotalReversed, decimal NetVat);
public record TopProductRow(
    int ProductId, string Sku, string Name, string Category, string? Brand, string? Supplier, string Uom,
    int Orders, decimal Units, decimal GrossRevenue, decimal Discounts, decimal Revenue,
    decimal Cogs, decimal GrossProfit, decimal MarginPct, decimal AvgSellingPrice, decimal SharePct,
    decimal ReturnedUnits, decimal ReturnRatePct, decimal OnHand, DateTime? LastSoldAt);
public record SlowMovingRow(
    int ProductId, string Sku, string Name, string Category, string? Brand, string? Supplier, string Uom,
    decimal OnHand, decimal CostPrice, decimal StockValue, decimal SellingPrice, decimal RetailValue,
    int ReorderLevel, DateTime? LastSoldAt, int? DaysSinceLastSale, decimal UnitsSoldInWindow, string Status);
// DueDate/DaysOverdue (BRD §4.2 payment terms): Outstanding is one running account balance, not
// per-invoice, so the due date is derived off the account's last purchase + its CreditTermDays — the
// same simplification the aging bucket itself already made with DaysSinceLastPurchase. Null CreditTermDays
// (no terms configured) means no due date can be derived, so DaysOverdue stays 0.
public record ContractorAgingRow(string Customer, decimal CreditLimit, decimal Outstanding, DateTime? LastPurchaseAt, int DaysSinceLastPurchase,
    int? CreditTermDays, DateTime? DueDate, int DaysOverdue);
public record RestockingFeeRow(string Month, int Returns, decimal FeesCollected);
public record DiscountUtilizationDto(decimal TotalDiscounts, int DiscountedOrders, int TotalOrders, decimal DiscountRatePct);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class ReportsController(AppDbContext db) : ReportControllerBase
{
    // Excludes voided orders everywhere — a voided sale is not revenue (BRD acceptance criterion 11:
    // report figures must reconcile with the transaction database including reversals).
    // `to` is EXCLUSIVE — see ReportFilters.Range: comparing a timestamp with `<= to` where `to`
    // came off a date picker silently drops everything transacted after midnight on the last day.
    private IQueryable<Order> CompletedOrders(DateTime from, DateTime toExclusive, int[]? branchId = null)
    {
        var query = db.Orders.Where(o => o.Status != OrderStatus.Voided && o.CreatedAt >= from && o.CreatedAt < toExclusive);
        // Must go through ReportFilters.ForSql — see the note there on why a raw int[] can't be
        // used in a translatable Contains.
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            query = query.Where(o => ids.Contains(o.BranchId));
        }
        return query;
    }

    // Sales Summary — the period's takings, the margin behind them, and the four cuts people
    // actually reconcile against: payment method, cashier, branch and day.
    //
    // Every filter here is an ORDER-level attribute (branch, cashier, customer, order type, payment
    // method). Category/product cuts are deliberately not offered: this summary sums whole orders,
    // so narrowing by product would leave Gross Sales counting the entire basket a product happened
    // to appear in, and the number would stop reconciling against Payment Methods next to it. Those
    // line-level cuts live in Top Products, Category Performance and Profit & Margin, which are
    // line-scoped by construction.
    [HttpGet("sales-summary")]
    public async Task<ActionResult<SalesSummaryDto>> SalesSummary(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? userId, [FromQuery] int[]? customerId, [FromQuery] string[]? orderType,
        [FromQuery] string[]? method, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);

        // Voided orders are pulled alongside so the summary can report how many were reversed,
        // without ever letting them into a revenue figure.
        var all = await db.Orders
            .Include(o => o.Payments).Include(o => o.Cashier).Include(o => o.Branch).Include(o => o.Fees)
            .Include(o => o.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Where(o => o.CreatedAt >= f && o.CreatedAt < t)
            .ToListAsync(ct);

        all = all.Where(o =>
            ReportFilters.Matches(branchId, o.BranchId)
            && ReportFilters.Matches(userId, o.CashierUserId)
            && ReportFilters.Matches(customerId, o.CustomerId)
            && ReportFilters.Matches(orderType, o.Type.ToString())
            && (!ReportFilters.Any(method) || o.Payments.Any(p => ReportFilters.Matches(method, p.Method.ToString()))))
            .ToList();

        var orders = all.Where(o => o.Status != OrderStatus.Voided).ToList();
        var voided = all.Where(o => o.Status == OrderStatus.Voided).ToList();

        // Qty in stock UOM where the UOM engine recorded one; legacy rows predating it carry
        // StockQty = 0 and must fall back to Qty (see OrderLine).
        static decimal Units(OrderLine l) => l.StockQty > 0 ? l.StockQty : l.Qty;
        static decimal LineCogs(OrderLine l) => Units(l) * (l.Product?.CostPrice ?? 0);
        // Ex-VAT revenue actually earned: gross line value less every discount applied to the order.
        static decimal NetRevenue(Order o) => o.SubTotal - o.DiscountTotal;

        var gross = orders.Sum(o => o.SubTotal);
        var discounts = orders.Sum(o => o.DiscountTotal);
        var cogs = orders.SelectMany(o => o.Lines).Sum(LineCogs);
        var netRevenue = orders.Sum(NetRevenue);
        var grossProfit = netRevenue - cogs;
        var collected = orders.SelectMany(o => o.Payments).Sum(p => p.Amount);

        var byMethod = orders.SelectMany(o => o.Payments)
            .GroupBy(p => p.Method.ToString())
            .Select(g => new
            {
                Method = g.Key,
                Amount = g.Sum(p => p.Amount),
                Count = g.Count(),
            })
            .ToList();
        // Refunds are matched to the method they were paid back out on, so each rail nets off.
        var refundsByMethod = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t)
            .Select(r => new { r.RefundMethod, r.NetCashback, BranchId = r.Order != null ? (int?)r.Order.BranchId : null })
            .ToListAsync(ct);
        var refundLookup = refundsByMethod
            .Where(r => ReportFilters.Matches(branchId, r.BranchId))
            .GroupBy(r => r.RefundMethod)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.NetCashback), StringComparer.OrdinalIgnoreCase);

        var methodRows = byMethod.Select(m =>
        {
            var refunded = refundLookup.GetValueOrDefault(m.Method, 0m);
            return new SalesByMethodRow(
                m.Method, Math.Round(m.Amount, 2), m.Count,
                collected == 0 ? 0 : Math.Round(m.Amount / collected * 100, 2),
                Math.Round(refunded, 2), Math.Round(m.Amount - refunded, 2));
        }).OrderByDescending(r => r.Amount).ToList();

        var voidsByUser = voided.GroupBy(o => o.CashierUserId).ToDictionary(g => g.Key, g => g.Count());
        var byCashier = orders.GroupBy(o => o.CashierUserId)
            .Select(g => new SalesByCashierRow(
                g.First().Cashier?.Name ?? $"User {g.Key}",
                string.Join(", ", g.Select(o => o.Branch?.NameEn ?? "").Where(b => b != "").Distinct()),
                Math.Round(g.Sum(o => o.GrandTotal), 2), g.Count(),
                Math.Round(g.Sum(o => o.DiscountTotal), 2),
                Math.Round(g.Sum(o => o.GrandTotal) / g.Count(), 2),
                voidsByUser.GetValueOrDefault(g.Key, 0)))
            .OrderByDescending(r => r.Amount).ToList();

        var byBranch = orders.GroupBy(o => o.Branch?.NameEn ?? $"Branch {o.BranchId}")
            .Select(g =>
            {
                var bGross = g.Sum(o => o.SubTotal);
                var bNetRevenue = g.Sum(NetRevenue);
                var bCogs = g.SelectMany(o => o.Lines).Sum(LineCogs);
                return new SalesByBranchRow(
                    g.Key, g.Count(), Math.Round(bGross, 2), Math.Round(g.Sum(o => o.DiscountTotal), 2),
                    Math.Round(g.Sum(o => o.VatTotal), 2), Math.Round(g.Sum(o => o.GrandTotal), 2),
                    Math.Round(bCogs, 2), Math.Round(bNetRevenue - bCogs, 2),
                    bNetRevenue == 0 ? 0 : Math.Round((bNetRevenue - bCogs) / bNetRevenue * 100, 2),
                    Math.Round(g.Sum(o => o.GrandTotal) / g.Count(), 2));
            })
            .OrderByDescending(r => r.Net).ToList();

        var byDay = orders.GroupBy(o => o.CreatedAt.Date)
            .Select(g =>
            {
                var dNetRevenue = g.Sum(NetRevenue);
                return new SalesByDayRow(
                    g.Key, g.Count(), Math.Round(g.Sum(o => o.SubTotal), 2),
                    Math.Round(g.Sum(o => o.DiscountTotal), 2), Math.Round(g.Sum(o => o.GrandTotal), 2),
                    Math.Round(dNetRevenue - g.SelectMany(o => o.Lines).Sum(LineCogs), 2));
            })
            .OrderBy(r => r.Date).ToList();

        var lineRevenue = orders.SelectMany(o => o.Lines).Sum(l => l.LineTotal);
        var byCategory = orders.SelectMany(o => o.Lines)
            .GroupBy(l => l.Product?.Category?.NameEn ?? "Uncategorised")
            .Select(g =>
            {
                var cRevenue = g.Sum(l => l.LineTotal);
                var cCogs = g.Sum(LineCogs);
                return new SalesByCategoryRow(
                    g.Key, Math.Round(g.Sum(Units), 2), Math.Round(cRevenue, 2), Math.Round(cCogs, 2),
                    Math.Round(cRevenue - cCogs, 2),
                    cRevenue == 0 ? 0 : Math.Round((cRevenue - cCogs) / cRevenue * 100, 2),
                    lineRevenue == 0 ? 0 : Math.Round(cRevenue / lineRevenue * 100, 2));
            })
            .OrderByDescending(r => r.Revenue).ToList();

        var periodReturns = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t)
            .Select(r => new { r.NetCashback, BranchId = r.Order != null ? (int?)r.Order.BranchId : null })
            .ToListAsync(ct);
        var matchedReturns = periodReturns.Where(r => ReportFilters.Matches(branchId, r.BranchId)).ToList();
        var refundValue = matchedReturns.Sum(r => r.NetCashback);

        return Ok(new SalesSummaryDto(
            Math.Round(gross, 2), Math.Round(discounts, 2),
            Math.Round(orders.Sum(o => o.VatTotal), 2),
            Math.Round(orders.SelectMany(o => o.Fees).Sum(x => x.Amount), 2),
            Math.Round(orders.Sum(o => o.GrandTotal), 2),
            orders.Count,
            Math.Round(orders.SelectMany(o => o.Lines).Sum(Units), 2),
            orders.Count == 0 ? 0 : Math.Round(orders.Sum(o => o.GrandTotal) / orders.Count, 2),
            Math.Round(cogs, 2), Math.Round(grossProfit, 2),
            netRevenue == 0 ? 0 : Math.Round(grossProfit / netRevenue * 100, 2),
            matchedReturns.Count, Math.Round(refundValue, 2),
            Math.Round(orders.Sum(o => o.GrandTotal) - refundValue, 2),
            orders.Where(o => o.CustomerId != null).Select(o => o.CustomerId!.Value).Distinct().Count(),
            voided.Count,
            methodRows, byCashier, byBranch, byDay, byCategory));
    }

    // BRD §11.1: Returns Analysis split by Standard / Surplus / Damaged / Exchange.
    [HttpGet("returns-analysis")]
    public async Task<ActionResult<List<ReturnsAnalysisRow>>> ReturnsAnalysis(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? customerId, [FromQuery] string[]? type, [FromQuery] string[]? status,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var returns = await db.Returns.Include(r => r.Lines).Include(r => r.Order)
            .Where(r => r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);
        returns = returns.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)
            && ReportFilters.Matches(customerId, r.CustomerId)
            && ReportFilters.Matches(type, r.Type.ToString())
            && ReportFilters.Matches(status, r.Status.ToString())).ToList();
        var rows = returns.GroupBy(r => r.Type.ToString())
            .Select(g => new ReturnsAnalysisRow(
                g.Key, g.Count(),
                Math.Round(g.Sum(r => r.GrossRefund), 2), Math.Round(g.Sum(r => r.VatReversal), 2),
                Math.Round(g.Sum(r => r.RestockingFeeAmount), 2),
                Math.Round(g.Sum(r => r.NetCashback > 0 ? r.NetCashback : r.Lines.Sum(l => l.Amount)), 2)))
            .OrderByDescending(r => r.NetCashback).ToList();
        return Ok(rows);
    }

    // BRD §11.1: Refund Method Report — cashback by refund method for daily reconciliation.
    [HttpGet("refund-methods")]
    public async Task<ActionResult<List<RefundMethodRow>>> RefundMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? customerId, [FromQuery] string[]? refundMethod, [FromQuery] string[]? type,
        CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var returns = await db.Returns.Include(r => r.Lines).Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);
        returns = returns.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)
            && ReportFilters.Matches(customerId, r.CustomerId)
            && ReportFilters.Matches(refundMethod, r.RefundMethod)
            && ReportFilters.Matches(type, r.Type.ToString())).ToList();
        var rows = returns.GroupBy(r => r.RefundMethod)
            .Select(g => new RefundMethodRow(g.Key, g.Count(),
                Math.Round(g.Sum(r => r.NetCashback > 0 ? r.NetCashback : r.Lines.Sum(l => l.Amount)), 2)))
            .OrderByDescending(r => r.Amount).ToList();
        return Ok(rows);
    }

    // BRD §11.2: VAT collected by rate code (from order lines, which carry per-line rates) and VAT
    // reversed on returns, netted for the period.
    [HttpGet("vat")]
    public async Task<ActionResult<VatReportDto>> Vat(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await CompletedOrders(f, t, branchId).Include(o => o.Lines).ToListAsync(ct);
        var collectedByRate = orders.SelectMany(o =>
            {
                // Re-derive each order's discount ratio so per-rate taxable amounts sum to the order's
                // own VatTotal (same math the checkout used).
                var lineTotalsSum = o.Lines.Sum(l => l.LineTotal);
                var perLine = o.SubTotal - lineTotalsSum;
                var orderDiscount = Math.Max(0, o.DiscountTotal - perLine);
                var ratio = lineTotalsSum == 0 ? 0 : orderDiscount / lineTotalsSum;
                return o.Lines.Select(l => (l.VatRate, Taxable: l.LineTotal * (1 - ratio)));
            })
            .GroupBy(x => x.VatRate)
            .Select(g => new VatByRateRow(g.Key, Math.Round(g.Sum(x => x.Taxable), 2), Math.Round(g.Sum(x => x.Taxable * x.VatRate / 100), 2)))
            .OrderByDescending(r => r.VatCollected).ToList();
        var totalCollected = Math.Round(collectedByRate.Sum(r => r.VatCollected), 2);
        var reversals = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t)
            .Select(r => new { r.VatReversal, BranchId = r.Order != null ? (int?)r.Order.BranchId : null })
            .ToListAsync(ct);
        var totalReversed = Math.Round(reversals
            .Where(r => ReportFilters.Matches(branchId, r.BranchId)).Sum(r => r.VatReversal), 2);
        return Ok(new VatReportDto(collectedByRate, totalCollected, totalReversed, Math.Round(totalCollected - totalReversed, 2)));
    }

    // Top Products — best sellers by revenue, with the margin, discounting and return rate behind
    // each one, so "top" can be read as "most profitable" rather than only "most rung up".
    [HttpGet("top-products")]
    public async Task<ActionResult<List<TopProductRow>>> TopProducts(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? categoryId, [FromQuery] int[]? productId, [FromQuery] int[]? supplierId,
        [FromQuery] string[]? brand, [FromQuery] int take = 20, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await CompletedOrders(f, t, branchId)
            .Include(o => o.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .Include(o => o.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Supplier)
            .ToListAsync(ct);

        var lines = orders.SelectMany(o => o.Lines.Select(l => (Order: o, Line: l)))
            .Where(x => ReportFilters.Matches(categoryId, x.Line.Product?.CategoryId ?? 0)
                && ReportFilters.Matches(productId, x.Line.ProductId)
                && ReportFilters.Matches(supplierId, x.Line.Product?.SupplierId)
                && ReportFilters.Matches(brand, x.Line.Product?.Brand))
            .ToList();

        // Returned units for the same window and product set, so a SKU that sells well but comes
        // straight back is visible as such rather than sitting near the top on gross units alone.
        var returnedLines = await db.ReturnLines.Include(l => l.Return)
            .Where(l => l.Return != null && l.Return.Status == ReturnStatus.Completed
                && l.Return.CreatedAt >= f && l.Return.CreatedAt < t)
            .Select(l => new { l.ProductId, l.Qty, l.StockQty })
            .ToListAsync(ct);
        var returnedByProduct = returnedLines
            .GroupBy(l => l.ProductId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty));

        // On-hand across every branch, so a top seller that has run out is obvious from the report.
        var onHandByProduct = await db.BranchStockLevels
            .GroupBy(s => s.ProductId)
            .Select(g => new { ProductId = g.Key, OnHand = g.Sum(s => s.OnHand) })
            .ToDictionaryAsync(x => x.ProductId, x => x.OnHand, ct);

        var totalRevenue = lines.Sum(x => x.Line.LineTotal);

        var rows = lines.GroupBy(x => x.Line.ProductId)
            .Select(g =>
            {
                var product = g.First().Line.Product;
                var units = g.Sum(x => x.Line.StockQty > 0 ? x.Line.StockQty : x.Line.Qty);
                // Gross is the list value before the line's own discount; Revenue is what was
                // actually charged. The gap between them is what discounting cost on this SKU.
                var grossRevenue = g.Sum(x => x.Line.Qty * x.Line.UnitPrice);
                var revenue = g.Sum(x => x.Line.LineTotal);
                var cogs = units * (product?.CostPrice ?? 0);
                var returned = returnedByProduct.GetValueOrDefault(g.Key, 0m);
                return new TopProductRow(
                    g.Key, product?.Sku ?? "", product?.NameEn ?? "", product?.Category?.NameEn ?? "",
                    product?.Brand, product?.Supplier?.NameEn, product?.StockUom ?? "",
                    g.Select(x => x.Order.Id).Distinct().Count(),
                    Math.Round(units, 2), Math.Round(grossRevenue, 2),
                    Math.Round(grossRevenue - revenue, 2), Math.Round(revenue, 2),
                    Math.Round(cogs, 2), Math.Round(revenue - cogs, 2),
                    revenue == 0 ? 0 : Math.Round((revenue - cogs) / revenue * 100, 2),
                    units == 0 ? 0 : Math.Round(revenue / units, 2),
                    totalRevenue == 0 ? 0 : Math.Round(revenue / totalRevenue * 100, 2),
                    Math.Round(returned, 2),
                    units == 0 ? 0 : Math.Round(returned / units * 100, 2),
                    onHandByProduct.GetValueOrDefault(g.Key, 0m),
                    g.Max(x => x.Order.CreatedAt));
            })
            .OrderByDescending(r => r.Revenue).Take(Math.Clamp(take, 1, 200)).ToList();
        return Ok(rows);
    }

    // BRD §11.1: products with stock on hand but no sales inside the window.
    // BRD §11.1: products with stock on hand but no sales inside the window, priced up so the
    // capital tied into dead stock is legible rather than only the fact that it hasn't moved.
    [HttpGet("slow-moving")]
    public async Task<ActionResult<List<SlowMovingRow>>> SlowMoving(
        [FromQuery] int days = 30, [FromQuery] int[]? branchId = null, [FromQuery] int[]? categoryId = null,
        [FromQuery] int[]? productId = null, [FromQuery] int[]? supplierId = null,
        [FromQuery] string[]? brand = null, CancellationToken ct = default)
    {
        var window = Math.Clamp(days, 1, 365);
        var cutoff = DateTime.UtcNow.AddDays(-window);
        var soldQuery = db.OrderLines.Where(l => l.Order!.Status != OrderStatus.Voided);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            soldQuery = soldQuery.Where(l => ids.Contains(l.Order!.BranchId));
        }
        var lastSold = await soldQuery
            .GroupBy(l => l.ProductId)
            .Select(g => new { ProductId = g.Key, LastSoldAt = g.Max(l => l.Order!.CreatedAt) })
            .ToDictionaryAsync(x => x.ProductId, x => (DateTime?)x.LastSoldAt, ct);
        // Units moved inside the window — non-zero here means the SKU is trickling rather than dead,
        // which is a different call from "hasn't sold at all".
        var soldInWindow = await soldQuery
            .Where(l => l.Order!.CreatedAt >= cutoff)
            .GroupBy(l => l.ProductId)
            .Select(g => new { ProductId = g.Key, Units = g.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty) })
            .ToDictionaryAsync(x => x.ProductId, x => x.Units, ct);

        var products = await db.Products
            .Include(p => p.BranchStockLevels).Include(p => p.Category).Include(p => p.Supplier)
            .Where(p => p.Status == EntityStatus.Active).ToListAsync(ct);
        var now = DateTime.UtcNow;
        var rows = products
            .Where(p => ReportFilters.Matches(categoryId, p.CategoryId)
                && ReportFilters.Matches(productId, p.Id)
                && ReportFilters.Matches(supplierId, p.SupplierId)
                && ReportFilters.Matches(brand, p.Brand))
            .Select(p => new
            {
                Product = p,
                OnHand = p.BranchStockLevels.Where(s => ReportFilters.Matches(branchId, s.BranchId)).Sum(s => s.OnHand),
            })
            .Where(x => x.OnHand > 0
                && (!lastSold.TryGetValue(x.Product.Id, out var sold) || sold < cutoff))
            .Select(x =>
            {
                var p = x.Product;
                var soldAt = lastSold.GetValueOrDefault(p.Id);
                var daysSince = soldAt is null ? (int?)null : (int)(now - soldAt.Value).TotalDays;
                return new SlowMovingRow(
                    p.Id, p.Sku, p.NameEn, p.Category?.NameEn ?? "", p.Brand, p.Supplier?.NameEn, p.StockUom,
                    x.OnHand, p.CostPrice, Math.Round(x.OnHand * p.CostPrice, 2),
                    p.SellingPrice, Math.Round(x.OnHand * p.SellingPrice, 2), p.ReorderLevel,
                    soldAt, daysSince, soldInWindow.GetValueOrDefault(p.Id, 0m),
                    // Never sold at all is a buying mistake; sold once a year ago is dead stock;
                    // beyond the window but inside a year is merely slow. They warrant different action.
                    soldAt is null ? "Never Sold" : daysSince >= 365 ? "Dead Stock" : "Slow Moving");
            })
            .OrderByDescending(r => r.StockValue).ToList();
        return Ok(rows);
    }

    // BRD §11.2: contractor account aging — outstanding balances with return credits already applied
    // (Module 6 posts credits directly against Customer.Outstanding).
    [HttpGet("contractor-aging")]
    public async Task<ActionResult<List<ContractorAgingRow>>> ContractorAging(
        [FromQuery] int[]? customerId, [FromQuery] string[]? customerType, CancellationToken ct = default)
    {
        var customers = await db.Customers
            .Where(c => (c.Type == CustomerType.Contractor || c.Type == CustomerType.B2B) && c.Outstanding != 0)
            .OrderByDescending(c => c.Outstanding).ToListAsync(ct);
        customers = customers.Where(c => ReportFilters.Matches(customerId, c.Id)
            && ReportFilters.Matches(customerType, c.Type.ToString())).ToList();
        var now = DateTime.UtcNow;
        return Ok(customers.Select(c =>
        {
            DateTime? dueDate = c.LastPurchaseAt is not null && c.CreditTermDays is not null
                ? c.LastPurchaseAt.Value.AddDays(c.CreditTermDays.Value) : null;
            var daysOverdue = dueDate is not null && now > dueDate.Value ? (int)(now - dueDate.Value).TotalDays : 0;
            return new ContractorAgingRow(
                c.NameEn, c.CreditLimit, c.Outstanding, c.LastPurchaseAt,
                c.LastPurchaseAt is null ? -1 : (int)(now - c.LastPurchaseAt.Value).TotalDays,
                c.CreditTermDays, dueDate, daysOverdue);
        }).ToList());
    }

    // BRD §11.2: restocking fee revenue by month.
    [HttpGet("restocking-fees")]
    public async Task<ActionResult<List<RestockingFeeRow>>> RestockingFees(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var returns = await db.Returns.Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.RestockingFeeAmount > 0 && r.CreatedAt >= f && r.CreatedAt < t)
            .ToListAsync(ct);
        returns = returns.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)).ToList();
        var rows = returns.GroupBy(r => r.CreatedAt.ToString("yyyy-MM"))
            .Select(g => new RestockingFeeRow(g.Key, g.Count(), Math.Round(g.Sum(r => r.RestockingFeeAmount), 2)))
            .OrderBy(r => r.Month).ToList();
        return Ok(rows);
    }

    [HttpGet("discount-utilization")]
    public async Task<ActionResult<DiscountUtilizationDto>> DiscountUtilization(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? userId, [FromQuery] string[]? orderType, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await CompletedOrders(f, t, branchId).ToListAsync(ct);
        orders = orders.Where(o => ReportFilters.Matches(userId, o.CashierUserId)
            && ReportFilters.Matches(orderType, o.Type.ToString())).ToList();
        var discounted = orders.Count(o => o.DiscountTotal > 0);
        var gross = orders.Sum(o => o.SubTotal);
        return Ok(new DiscountUtilizationDto(
            Math.Round(orders.Sum(o => o.DiscountTotal), 2), discounted, orders.Count,
            gross > 0 ? Math.Round(orders.Sum(o => o.DiscountTotal) / gross * 100, 2) : 0));
    }
}
