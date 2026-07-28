using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/pos/parked-sales")]
[Authorize]
[RequireModule("/operate/pos-checkout", PermissionAction.View)]
public class ParkedSalesController(AppDbContext db, IAuditService audit, IStockReservationService reservations) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ParkedSaleDto>>> List([FromQuery] int? branchId, CancellationToken ct)
    {
        var query = Query();
        if (branchId is not null) query = query.Where(p => p.BranchId == branchId);
        var rows = await query.OrderByDescending(p => p.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/operate/pos-checkout", PermissionAction.Create)]
    public async Task<ActionResult<ParkedSaleDto>> Create(CreateParkedSaleRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0) return BadRequest(new { error = "Cannot hold an empty cart." });

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var parked = new ParkedSale
        {
            TicketNo = $"HOLD-{DateTime.UtcNow:yyMMdd}-{await db.ParkedSales.CountAsync(ct) + 1:D3}",
            BranchId = request.BranchId, TerminalId = request.TerminalId, CashierUserId = cashierId,
            CustomerId = request.CustomerId, Notes = request.Notes,
        };
        var products = new Dictionary<int, Product>();
        foreach (var line in request.Lines)
        {
            var product = await db.Products.FindAsync([line.ProductId], ct);
            if (product is null) return BadRequest(new { error = $"Unknown product {line.ProductId}." });
            products[line.ProductId] = product;
            parked.Lines.Add(new ParkedSaleLine { ProductId = line.ProductId, Qty = line.Qty });
        }

        // A held cart reserves its stock too — otherwise another cashier could sell the exact items
        // sitting in this hold out from under it before the customer comes back to pay.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var failedProductId = await reservations.ReserveAsync(request.BranchId, parked.Lines.Select(l => (l.ProductId, l.Qty)), ct);
        if (failedProductId is not null)
        {
            await tx.RollbackAsync(ct);
            var sku = products.TryGetValue(failedProductId.Value, out var p) ? p.Sku : failedProductId.ToString();
            return BadRequest(new { error = $"Insufficient stock for {sku} to hold this cart." });
        }

        db.ParkedSales.Add(parked);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("pos", "SALE_HELD", parked.Id.ToString(), userId: cashierId, branchId: request.BranchId, cancellationToken: ct);

        var created = await Query().FirstAsync(p => p.Id == parked.Id, ct);
        return Ok(Map(created));
    }

    [HttpDelete("{id:int}")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var parked = await Query().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (parked is null) return NotFound();

        // Releases the hold whether the ticket is being resumed (the cart goes back through the
        // normal checkout stock check) or simply discarded.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await reservations.ReleaseAsync(parked.BranchId, parked.Lines.Select(l => (l.ProductId, l.Qty)), ct);
        db.ParkedSales.Remove(parked);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("pos", "SALE_RESUMED", id.ToString(), cancellationToken: ct);
        return NoContent();
    }

    private IQueryable<ParkedSale> Query() => db.ParkedSales
        .Include(p => p.Cashier).Include(p => p.Customer).Include(p => p.Lines).ThenInclude(l => l.Product);

    private static ParkedSaleDto Map(ParkedSale p) => new(
        p.Id, p.TicketNo, p.BranchId, p.TerminalId, p.Cashier?.Name ?? "", p.CustomerId, p.Customer?.NameEn, p.Notes, p.CreatedAt,
        p.Lines.Sum(l => l.Qty * (l.Product?.SellingPrice ?? 0)),
        p.Lines.Select(l => new ParkedLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.Product?.SellingPrice ?? 0)).ToList());
}
