using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Phase 5 (BRD §5.8 Analytics & Reporting) — bundle-engine reports, living under the same
// api/insights/reports route and /insights/reports permission every other report uses (NOT
// /stock/bundles, which only gates the Bundle CRUD screen) so they render in the same Reports
// console (ReportsConsole.tsx) as every other report, per the user's explicit placement request.
// Replaces the old BundlesController.SalesReport, which was gated under /stock/bundles and had no
// frontend call site — dead code, now superseded by BundleSales below.
public record BundleSalesRow(
    int BundleId, string Code, string NameEn, string Type, decimal UnitsSold,
    decimal Revenue, decimal Savings, decimal Cogs, decimal GrossProfit, decimal MarginPct);
public record BundleProductContributionRow(
    int BundleId, string BundleCode, string BundleName, int ProductId, string Sku, string ProductName,
    decimal QtySold, decimal Revenue);
// BRD §5.5 Bundle Suggestion Engine: Suggested = shown at POS, Accepted = cashier added the bundle
// from the suggestion, Rejected = cashier dismissed it. Sourced from BundleSuggestionEvent (Phase 5
// instrumentation — see PosCheckout.tsx), which didn't exist before this phase.
public record BundleSuggestionRow(
    int BundleId, string Code, string NameEn, int Suggested, int Accepted, int Rejected, decimal ConversionPct);
// Buy-X-Get-Y "issued/redeemed" collapse to one count here: unlike a coupon, a Buy-X-Get-Y deal has
// no separate issuance step — it auto-applies at checkout, so every application IS a redemption.
public record BundlePromotionRow(
    int ProductId, string Sku, string ProductName, int TimesApplied, decimal PaidUnits, decimal FreeUnits);
public record PalletUtilizationRow(
    int ProductId, string Sku, string ProductName, decimal PalletUnitsSold, decimal LooseUnitsSold, decimal Difference);

[ApiController]
[Route("api/insights/reports")]
[Authorize]
[RequireModule("/insights/reports", PermissionAction.View)]
public class BundleReportsController(AppDbContext db) : ReportControllerBase
{
    private IQueryable<OrderLine> BundleLinesInWindow(DateTime f, DateTime t, int[]? branchId)
    {
        var query = db.OrderLines.Include(l => l.Order)
            .Where(l => l.BundleId != null && l.Order!.Status != OrderStatus.Voided
                && l.Order.CreatedAt >= f && l.Order.CreatedAt < t);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            query = query.Where(l => ids.Contains(l.Order!.BranchId));
        }
        return query;
    }

    // BRD §5.4 Bundle Sales: units, revenue, savings vs individual pricing, margin — the same math
    // BundlesController.SalesReport used, now windowed/branch-filtered like every other report and
    // extended with COGS/gross profit/margin (the old endpoint stopped at DiscountGiven).
    [HttpGet("bundle-sales")]
    public async Task<ActionResult<List<BundleSalesRow>>> BundleSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct)
    {
        var (f, t) = Window(from, to);
        var bundles = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product).ToListAsync(ct);
        var soldLines = await BundleLinesInWindow(f, t, branchId)
            .Select(l => new { l.BundleId, l.ProductId, l.Qty, l.LineTotal }).ToListAsync(ct);

        var rows = new List<BundleSalesRow>();
        foreach (var bundle in bundles)
        {
            var sold = soldLines.Where(s => s.BundleId == bundle.Id).ToList();
            if (sold.Count == 0) continue;
            // Units = sold quantity of the first matched constituent ÷ its per-bundle quantity —
            // every constituent scales together, so any of them recovers the bundle count (same
            // reconstruction BundlesController.SalesReport already used).
            var reference = bundle.Lines.FirstOrDefault(l => sold.Any(s => s.ProductId == l.ProductId));
            var unitsSold = reference is null || reference.Qty == 0 ? 0
                : Math.Round(sold.Where(s => s.ProductId == reference.ProductId).Sum(s => s.Qty) / reference.Qty, 2);
            var revenue = sold.Sum(s => s.LineTotal);
            var individualPerUnit = bundle.Lines.Sum(l => l.Qty * (l.Product?.SellingPrice ?? 0));
            var revenueAtIndividual = Math.Round(unitsSold * individualPerUnit, 2);
            var costPerUnit = bundle.Lines.Sum(l => l.Qty * (l.Product?.CostPrice ?? 0));
            var cogs = Math.Round(unitsSold * costPerUnit, 2);
            var grossProfit = Math.Round(revenue - cogs, 2);
            rows.Add(new BundleSalesRow(
                bundle.Id, bundle.Code, bundle.NameEn, bundle.Type.ToString(), unitsSold,
                Math.Round(revenue, 2), Math.Round(revenueAtIndividual - revenue, 2), cogs, grossProfit,
                revenue == 0 ? 0 : Math.Round(grossProfit / revenue * 100, 2)));
        }
        return Ok(rows.OrderByDescending(r => r.Revenue).ToList());
    }

    // BRD §5.4 Product Contribution: which constituents actually drive each bundle's volume/revenue —
    // matters for kits where one SKU (e.g. the primer in a waterproofing kit) is the real draw.
    [HttpGet("bundle-product-contribution")]
    public async Task<ActionResult<List<BundleProductContributionRow>>> BundleProductContribution(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct)
    {
        var (f, t) = Window(from, to);
        var lines = await BundleLinesInWindow(f, t, branchId)
            .Include(l => l.Product).Include(l => l.Bundle)
            .Select(l => new { l.BundleId, BundleCode = l.Bundle!.Code, BundleName = l.Bundle.NameEn, l.ProductId, Sku = l.Product!.Sku, ProductName = l.Product.NameEn, l.Qty, l.LineTotal })
            .ToListAsync(ct);

        var rows = lines.GroupBy(l => new { l.BundleId, l.ProductId })
            .Select(g => new BundleProductContributionRow(
                g.Key.BundleId!.Value, g.First().BundleCode, g.First().BundleName, g.Key.ProductId,
                g.First().Sku, g.First().ProductName, Math.Round(g.Sum(x => x.Qty), 2), Math.Round(g.Sum(x => x.LineTotal), 2)))
            .OrderByDescending(r => r.Revenue)
            .ToList();
        return Ok(rows);
    }

    // BRD §5.5 Suggestion Report — see BundleSuggestionRow doc comment above for the data source.
    [HttpGet("bundle-suggestions")]
    public async Task<ActionResult<List<BundleSuggestionRow>>> BundleSuggestions(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct)
    {
        var (f, t) = Window(from, to);
        var query = db.BundleSuggestionEvents.Include(e => e.Bundle)
            .Where(e => e.CreatedAt >= f && e.CreatedAt < t);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            query = query.Where(e => e.BranchId != null && ids.Contains(e.BranchId.Value));
        }
        var events = await query.ToListAsync(ct);

        var rows = events.GroupBy(e => e.BundleId)
            .Select(g =>
            {
                var suggested = g.Count(e => e.EventType == BundleSuggestionEventType.Shown);
                var accepted = g.Count(e => e.EventType == BundleSuggestionEventType.Accepted);
                var rejected = g.Count(e => e.EventType == BundleSuggestionEventType.Rejected);
                return new BundleSuggestionRow(
                    g.Key, g.First().Bundle?.Code ?? "", g.First().Bundle?.NameEn ?? "", suggested, accepted, rejected,
                    suggested == 0 ? 0 : Math.Round((decimal)accepted / suggested * 100, 2));
            })
            .OrderByDescending(r => r.Suggested)
            .ToList();
        return Ok(rows);
    }

    // BRD §5.4 Promotion Report (Buy X Get Y): free units are the unambiguous, structural marker
    // already used everywhere else (DiscountPct == 100, non-bundle — same one ReceiptDialog.tsx
    // reads to show "(FREE)"), not a Notes string match, since PricingRule isn't FK'd from OrderLine.
    [HttpGet("bundle-promotions")]
    public async Task<ActionResult<List<BundlePromotionRow>>> BundlePromotions(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct)
    {
        var (f, t) = Window(from, to);
        var freeLineQuery = db.OrderLines.Include(l => l.Order)
            .Where(l => l.BundleId == null && l.DiscountPct == 100 && l.Order!.Status != OrderStatus.Voided
                && l.Order.CreatedAt >= f && l.Order.CreatedAt < t);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            freeLineQuery = freeLineQuery.Where(l => ids.Contains(l.Order!.BranchId));
        }
        var freeLines = await freeLineQuery.Select(l => new { l.OrderId, l.ProductId }).Distinct().ToListAsync(ct);
        if (freeLines.Count == 0) return Ok(new List<BundlePromotionRow>());

        var orderIds = freeLines.Select(l => l.OrderId).Distinct().ToList();
        var keys = freeLines.Select(l => (l.OrderId, l.ProductId)).ToHashSet();
        var candidateLines = await db.OrderLines.Where(l => orderIds.Contains(l.OrderId) && l.BundleId == null)
            .Select(l => new { l.OrderId, l.ProductId, l.Qty, l.DiscountPct }).ToListAsync(ct);
        var relevant = candidateLines.Where(l => keys.Contains((l.OrderId, l.ProductId))).ToList();
        var productIds = relevant.Select(l => l.ProductId).Distinct().ToList();
        var products = await db.Products.Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Sku, p.NameEn }).ToDictionaryAsync(p => p.Id, ct);

        var rows = relevant.GroupBy(l => l.ProductId)
            .Select(g =>
            {
                var free = g.Where(l => l.DiscountPct == 100).Sum(l => l.Qty);
                var product = products.GetValueOrDefault(g.Key);
                return new BundlePromotionRow(
                    g.Key, product?.Sku ?? "", product?.NameEn ?? "",
                    g.Select(l => l.OrderId).Distinct().Count(), Math.Round(g.Sum(l => l.Qty) - free, 2), Math.Round(free, 2));
            })
            .OrderByDescending(r => r.FreeUnits)
            .ToList();
        return Ok(rows);
    }

    // BRD §5.4 Pallet Report: pallet-priced lines are tagged Notes starting "Pallet price" (the
    // literal includes the tier size, e.g. "Pallet price (50+)", so this is a prefix match, not
    // equality) — same lack of a PricingRule FK on OrderLine as the promotion report above, so
    // "Loose Bags" is reconstructed from sibling same-order/same-product lines rather than a direct
    // join. Difference = pallet units − loose units, i.e. how much of the product's volume in a
    // pallet-eligible order actually cleared the tier vs. stayed at normal price.
    [HttpGet("pallet-utilization")]
    public async Task<ActionResult<List<PalletUtilizationRow>>> PalletUtilization(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int[]? branchId, CancellationToken ct)
    {
        var (f, t) = Window(from, to);
        var palletLineQuery = db.OrderLines.Include(l => l.Order)
            .Where(l => l.BundleId == null && l.Notes != null && l.Notes.StartsWith("Pallet price")
                && l.Order!.Status != OrderStatus.Voided && l.Order.CreatedAt >= f && l.Order.CreatedAt < t);
        if (ReportFilters.Any(branchId))
        {
            var ids = ReportFilters.ForSql(branchId);
            palletLineQuery = palletLineQuery.Where(l => ids.Contains(l.Order!.BranchId));
        }
        var palletLines = await palletLineQuery.Select(l => new { l.OrderId, l.ProductId, l.Qty }).ToListAsync(ct);
        if (palletLines.Count == 0) return Ok(new List<PalletUtilizationRow>());

        var orderIds = palletLines.Select(l => l.OrderId).Distinct().ToList();
        var keys = palletLines.Select(l => (l.OrderId, l.ProductId)).ToHashSet();
        var candidateLines = await db.OrderLines.Where(l => orderIds.Contains(l.OrderId) && l.BundleId == null)
            .Select(l => new { l.OrderId, l.ProductId, l.Qty, l.Notes }).ToListAsync(ct);
        var relevant = candidateLines.Where(l => keys.Contains((l.OrderId, l.ProductId))).ToList();
        var productIds = relevant.Select(l => l.ProductId).Distinct().ToList();
        var products = await db.Products.Where(p => productIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Sku, p.NameEn }).ToDictionaryAsync(p => p.Id, ct);

        var rows = relevant.GroupBy(l => l.ProductId)
            .Select(g =>
            {
                var pallet = g.Where(l => l.Notes != null && l.Notes.StartsWith("Pallet price")).Sum(l => l.Qty);
                var loose = g.Sum(l => l.Qty) - pallet;
                var product = products.GetValueOrDefault(g.Key);
                return new PalletUtilizationRow(
                    g.Key, product?.Sku ?? "", product?.NameEn ?? "", Math.Round(pallet, 2), Math.Round(loose, 2), Math.Round(pallet - loose, 2));
            })
            .OrderByDescending(r => r.PalletUnitsSold)
            .ToList();
        return Ok(rows);
    }
}
