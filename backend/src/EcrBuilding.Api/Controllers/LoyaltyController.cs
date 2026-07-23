using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Loyalty;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/loyalty")]
[Authorize]
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
public class LoyaltyController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet("transactions")]
    public async Task<ActionResult<List<LoyaltyTransactionDto>>> Transactions([FromQuery] int? customerId, CancellationToken ct)
    {
        var query = db.LoyaltyTransactions
            .Include(t => t.Customer).Include(t => t.Order).Include(t => t.Branch).Include(t => t.CreatedByUser)
            .AsQueryable();
        if (customerId is not null) query = query.Where(t => t.CustomerId == customerId);

        var rows = await query.OrderByDescending(t => t.CreatedAt).Take(500).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpGet("customers/{customerId:int}")]
    public async Task<ActionResult<CustomerLoyaltyDto>> CustomerSummary(int customerId, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([customerId], ct);
        if (customer is null) return NotFound();

        var recent = await db.LoyaltyTransactions
            .Include(t => t.Customer).Include(t => t.Order).Include(t => t.Branch).Include(t => t.CreatedByUser)
            .Where(t => t.CustomerId == customerId).OrderByDescending(t => t.CreatedAt).Take(20).ToListAsync(ct);

        return Ok(MapSummary(customer, recent));
    }

    [HttpPost("redeem")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<CustomerLoyaltyDto>> Redeem(RedeemPointsRequest request, CancellationToken ct)
    {
        if (request.Points <= 0) return BadRequest(new { error = "Points to redeem must be greater than zero." });

        var customer = await db.Customers.FindAsync([request.CustomerId], ct);
        if (customer is null) return NotFound();
        if (!customer.LoyaltyEnrolled) return BadRequest(new { error = $"{customer.NameEn} is not enrolled in the loyalty program." });
        if (customer.LoyaltyPoints < request.Points)
        {
            return BadRequest(new { error = $"{customer.NameEn} only has {customer.LoyaltyPoints} points available." });
        }

        var userId = CurrentUserId();
        customer.LoyaltyPoints -= request.Points;
        db.LoyaltyTransactions.Add(new LoyaltyTransaction
        {
            CustomerId = customer.Id, Type = LoyaltyTransactionType.Redeem, Points = -request.Points,
            Description = string.IsNullOrWhiteSpace(request.Description) ? "Points redeemed" : request.Description,
            CreatedByUserId = userId,
        });
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "LOYALTY_REDEEMED", customer.Id.ToString(), userId: userId, newValue: request, cancellationToken: ct);

        var recent = await db.LoyaltyTransactions
            .Include(t => t.Customer).Include(t => t.Order).Include(t => t.Branch).Include(t => t.CreatedByUser)
            .Where(t => t.CustomerId == customer.Id).OrderByDescending(t => t.CreatedAt).Take(20).ToListAsync(ct);
        return Ok(MapSummary(customer, recent));
    }

    [HttpPost("adjust")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<CustomerLoyaltyDto>> Adjust(AdjustPointsRequest request, CancellationToken ct)
    {
        if (request.Points == 0) return BadRequest(new { error = "Adjustment must be non-zero." });
        if (string.IsNullOrWhiteSpace(request.Description)) return BadRequest(new { error = "A reason is required for a manual adjustment." });

        var customer = await db.Customers.FindAsync([request.CustomerId], ct);
        if (customer is null) return NotFound();
        if (customer.LoyaltyPoints + request.Points < 0)
        {
            return BadRequest(new { error = $"This would take {customer.NameEn} below zero points." });
        }

        var userId = CurrentUserId();
        customer.LoyaltyPoints += request.Points;
        if (request.Points > 0) customer.LoyaltyLifetimePoints += request.Points;
        customer.LoyaltyTier = LoyaltyRules.TierForLifetimePoints(customer.LoyaltyLifetimePoints);

        db.LoyaltyTransactions.Add(new LoyaltyTransaction
        {
            CustomerId = customer.Id, Type = LoyaltyTransactionType.Adjust, Points = request.Points,
            Description = request.Description, CreatedByUserId = userId,
        });
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "LOYALTY_ADJUSTED", customer.Id.ToString(), userId: userId, newValue: request, cancellationToken: ct);

        var recent = await db.LoyaltyTransactions
            .Include(t => t.Customer).Include(t => t.Order).Include(t => t.Branch).Include(t => t.CreatedByUser)
            .Where(t => t.CustomerId == customer.Id).OrderByDescending(t => t.CreatedAt).Take(20).ToListAsync(ct);
        return Ok(MapSummary(customer, recent));
    }

    private int? CurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return claim is null ? null : int.Parse(claim);
    }

    private static CustomerLoyaltyDto MapSummary(Customer c, List<LoyaltyTransaction> recent) => new(
        c.Id, c.NameEn, c.LoyaltyEnrolled, c.LoyaltyPoints, LoyaltyRules.SarForPoints(c.LoyaltyPoints),
        c.LoyaltyLifetimePoints, c.LoyaltyTier.ToString(), recent.Select(Map).ToList());

    private static LoyaltyTransactionDto Map(LoyaltyTransaction t) => new(
        t.Id, t.CustomerId, t.Customer?.NameEn ?? "", t.OrderId, t.Order?.OrderNo, t.BranchId, t.Branch?.NameEn,
        t.Type.ToString(), t.Points, t.Description, t.CreatedByUser?.Name, t.CreatedAt);
}
