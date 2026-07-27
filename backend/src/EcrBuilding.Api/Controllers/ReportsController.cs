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
public record SalesByMethodRow(string Method, decimal Amount, int Count);
public record SalesByCashierRow(string Cashier, decimal Amount, int Orders);
public record SalesSummaryDto(decimal GrossSales, decimal Discounts, decimal Vat, decimal NetSales, int OrderCount, IReadOnlyList<SalesByMethodRow> ByMethod, IReadOnlyList<SalesByCashierRow> ByCashier);
public record ReturnsAnalysisRow(string Type, int Count, decimal GrossRefund, decimal VatReversed, decimal RestockingFees, decimal NetCashback);
public record RefundMethodRow(string Method, int Count, decimal Amount);
public record VatByRateRow(decimal Rate, decimal TaxableAmount, decimal VatCollected);
public record VatReportDto(IReadOnlyList<VatByRateRow> Collected, decimal TotalCollected, decimal TotalReversed, decimal NetVat);
public record TopProductRow(string Sku, string Name, decimal Units, decimal Revenue);
public record SlowMovingRow(string Sku, string Name, decimal OnHand, DateTime? LastSoldAt);
public record ContractorAgingRow(string Customer, decimal CreditLimit, decimal Outstanding, DateTime? LastPurchaseAt, int DaysSinceLastPurchase);
public record RestockingFeeRow(string Month, int Returns, decimal FeesCollected);
public record DiscountUtilizationDto(decimal TotalDiscounts, int DiscountedOrders, int TotalOrders, decimal DiscountRatePct);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule(ModuleArea.Insights, AccessLevel.View)]
public class ReportsController(AppDbContext db) : ControllerBase
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

    private static (DateTime From, DateTime ToExclusive) Window(DateTime? from, DateTime? to) =>
        ReportFilters.Range(from, to);

    [HttpGet("sales-summary")]
    public async Task<ActionResult<SalesSummaryDto>> SalesSummary(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await CompletedOrders(f, t, branchId).Include(o => o.Payments).Include(o => o.Cashier).ToListAsync(ct);
        var byMethod = orders.SelectMany(o => o.Payments)
            .GroupBy(p => p.Method.ToString())
            .Select(g => new SalesByMethodRow(g.Key, Math.Round(g.Sum(p => p.Amount), 2), g.Count()))
            .OrderByDescending(r => r.Amount).ToList();
        var byCashier = orders.GroupBy(o => o.Cashier?.Name ?? $"User {o.CashierUserId}")
            .Select(g => new SalesByCashierRow(g.Key, Math.Round(g.Sum(o => o.GrandTotal), 2), g.Count()))
            .OrderByDescending(r => r.Amount).ToList();
        return Ok(new SalesSummaryDto(
            Math.Round(orders.Sum(o => o.SubTotal), 2), Math.Round(orders.Sum(o => o.DiscountTotal), 2),
            Math.Round(orders.Sum(o => o.VatTotal), 2), Math.Round(orders.Sum(o => o.GrandTotal), 2),
            orders.Count, byMethod, byCashier));
    }

    // BRD §11.1: Returns Analysis split by Standard / Surplus / Damaged / Exchange.
    [HttpGet("returns-analysis")]
    public async Task<ActionResult<List<ReturnsAnalysisRow>>> ReturnsAnalysis(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var returns = await db.Returns.Include(r => r.Lines).Include(r => r.Order)
            .Where(r => r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);
        returns = returns.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)).ToList();
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
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var returns = await db.Returns.Include(r => r.Lines).Include(r => r.Order)
            .Where(r => r.Status == ReturnStatus.Completed && r.CreatedAt >= f && r.CreatedAt < t).ToListAsync(ct);
        returns = returns.Where(r => ReportFilters.Matches(branchId, r.Order?.BranchId)).ToList();
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

    [HttpGet("top-products")]
    public async Task<ActionResult<List<TopProductRow>>> TopProducts(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId,
        [FromQuery] int[]? categoryId, [FromQuery] int take = 10, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var lines = await CompletedOrders(f, t, branchId).SelectMany(o => o.Lines).Include(l => l.Product).ToListAsync(ct);
        lines = lines.Where(l => ReportFilters.Matches(categoryId, l.Product?.CategoryId ?? 0)).ToList();
        var rows = lines.GroupBy(l => new { l.ProductId, Sku = l.Product?.Sku ?? "", Name = l.Product?.NameEn ?? "" })
            .Select(g => new TopProductRow(g.Key.Sku, g.Key.Name,
                Math.Round(g.Sum(l => l.StockQty > 0 ? l.StockQty : l.Qty), 2), Math.Round(g.Sum(l => l.LineTotal), 2)))
            .OrderByDescending(r => r.Revenue).Take(Math.Clamp(take, 1, 100)).ToList();
        return Ok(rows);
    }

    // BRD §11.1: products with stock on hand but no sales inside the window.
    [HttpGet("slow-moving")]
    public async Task<ActionResult<List<SlowMovingRow>>> SlowMoving(
        [FromQuery] int days = 30, [FromQuery] int[]? branchId = null, [FromQuery] int[]? categoryId = null,
        [FromQuery] int[]? productId = null, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-Math.Clamp(days, 1, 365));
        var lastSoldQuery = db.OrderLines.Where(l => l.Order!.Status != OrderStatus.Voided);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            lastSoldQuery = lastSoldQuery.Where(l => ids.Contains(l.Order!.BranchId));
        }
        var lastSold = await lastSoldQuery
            .GroupBy(l => l.ProductId)
            .Select(g => new { ProductId = g.Key, LastSoldAt = g.Max(l => l.Order!.CreatedAt) })
            .ToDictionaryAsync(x => x.ProductId, x => (DateTime?)x.LastSoldAt, ct);
        var products = await db.Products.Include(p => p.BranchStockLevels)
            .Where(p => p.Status == EntityStatus.Active).ToListAsync(ct);
        var rows = products
            .Where(p => ReportFilters.Matches(categoryId, p.CategoryId) && ReportFilters.Matches(productId, p.Id))
            .Select(p => new
            {
                Product = p,
                OnHand = p.BranchStockLevels.Where(s => ReportFilters.Matches(branchId, s.BranchId)).Sum(s => s.OnHand),
            })
            .Where(x => x.OnHand > 0
                && (!lastSold.TryGetValue(x.Product.Id, out var sold) || sold < cutoff))
            .Select(x => new SlowMovingRow(x.Product.Sku, x.Product.NameEn, x.OnHand,
                lastSold.TryGetValue(x.Product.Id, out var soldAt) ? soldAt : null))
            .OrderBy(r => r.LastSoldAt ?? DateTime.MinValue).ToList();
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
        return Ok(customers.Select(c => new ContractorAgingRow(
            c.NameEn, c.CreditLimit, c.Outstanding, c.LastPurchaseAt,
            c.LastPurchaseAt is null ? -1 : (int)(now - c.LastPurchaseAt.Value).TotalDays)).ToList());
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
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct = default)
    {
        var (f, t) = Window(from, to);
        var orders = await CompletedOrders(f, t, branchId).ToListAsync(ct);
        var discounted = orders.Count(o => o.DiscountTotal > 0);
        var gross = orders.Sum(o => o.SubTotal);
        return Ok(new DiscountUtilizationDto(
            Math.Round(orders.Sum(o => o.DiscountTotal), 2), discounted, orders.Count,
            gross > 0 ? Math.Round(orders.Sum(o => o.DiscountTotal) / gross * 100, 2) : 0));
    }
}
