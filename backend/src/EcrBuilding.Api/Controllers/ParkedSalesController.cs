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
[RequireModule(ModuleArea.Pos, AccessLevel.View)]
public class ParkedSalesController(AppDbContext db, IAuditService audit) : ControllerBase
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
    [RequireModule(ModuleArea.Pos, AccessLevel.Edit)]
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
        foreach (var line in request.Lines)
        {
            if (!await db.Products.AnyAsync(p => p.Id == line.ProductId, ct)) return BadRequest(new { error = $"Unknown product {line.ProductId}." });
            parked.Lines.Add(new ParkedSaleLine { ProductId = line.ProductId, Qty = line.Qty });
        }

        db.ParkedSales.Add(parked);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", "SALE_HELD", parked.Id.ToString(), userId: cashierId, branchId: request.BranchId, cancellationToken: ct);

        var created = await Query().FirstAsync(p => p.Id == parked.Id, ct);
        return Ok(Map(created));
    }

    [HttpDelete("{id:int}")]
    [RequireModule(ModuleArea.Pos, AccessLevel.Edit)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var parked = await db.ParkedSales.FindAsync([id], ct);
        if (parked is null) return NotFound();
        db.ParkedSales.Remove(parked);
        await db.SaveChangesAsync(ct);
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
