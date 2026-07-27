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
    // BRD §4.3.1-§4.3.4: earn/redeem economics AND the tier ladder (thresholds, multipliers,
    // discounts), free delivery, birthday bonus and points expiry — all configured from the
    // Loyalty Program page itself (not the generic Admin > Pos Settings browser) — Finance-scoped
    // like the rest of this controller, not Admin-scoped like SettingsController, so a
    // Finance/Accountant role that manages loyalty can reach it without needing Admin access too.
    [HttpGet("config")]
    public async Task<ActionResult<LoyaltyProgramConfigDto>> GetConfig(CancellationToken ct)
    {
        var config = await db.GetLoyaltyConfigAsync(ct);
        return Ok(ToDto(config));
    }

    [HttpPut("config")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<LoyaltyProgramConfigDto>> UpdateConfig(LoyaltyProgramConfigDto request, CancellationToken ct)
    {
        if (request.PointsPerSarEarned <= 0) return BadRequest(new { error = "Points earned per SAR must be greater than zero." });
        if (request.PointsPerSarRedeemed <= 0) return BadRequest(new { error = "Points needed per SAR redeemed must be greater than zero." });
        if (request.MinRedeemPoints < 0) return BadRequest(new { error = "Minimum redemption points can't be negative." });
        if (request.MaxRedeemPctOfTotal is <= 0 or > 100) return BadRequest(new { error = "Maximum redemption must be between 0 and 100%." });
        if (request.SilverThreshold <= 0 || request.GoldThreshold <= request.SilverThreshold || request.PlatinumThreshold <= request.GoldThreshold)
        {
            return BadRequest(new { error = "Tier thresholds must increase Silver < Gold < Platinum, all greater than zero." });
        }
        if (request.SilverMultiplier < 1 || request.GoldMultiplier < request.SilverMultiplier || request.PlatinumMultiplier < request.GoldMultiplier)
        {
            return BadRequest(new { error = "Points multipliers must be at least 1x and increase Silver ≤ Gold ≤ Platinum." });
        }
        if (request.SilverDiscountPct < 0 || request.GoldDiscountPct < request.SilverDiscountPct || request.PlatinumDiscountPct < request.GoldDiscountPct || request.PlatinumDiscountPct > 100)
        {
            return BadRequest(new { error = "Tier discounts must be 0-100% and increase Silver ≤ Gold ≤ Platinum." });
        }
        if (request.FreeDeliveryMinOrderSar < 0) return BadRequest(new { error = "The free-delivery minimum order can't be negative." });
        if (request.BirthdayBonusMultiplier < 1) return BadRequest(new { error = "The birthday bonus multiplier must be at least 1x." });
        if (request.PointsExpiryMonths <= 0) return BadRequest(new { error = "Points expiry must be at least 1 month." });

        var userId = CurrentUserId();
        async Task UpsertAsync(string key, string value)
        {
            var setting = await db.Settings.FirstOrDefaultAsync(
                s => s.Category == "Pos" && s.Group == "Loyalty" && s.Key == key && s.Scope == SettingScope.Global, ct);
            if (setting is null)
            {
                setting = new Setting { Category = "Pos", Group = "Loyalty", Key = key, Scope = SettingScope.Global };
                db.Settings.Add(setting);
            }
            setting.Value = value;
            setting.EffectiveFrom = DateTime.UtcNow;
            setting.ChangedByUserId = userId;
        }

        var inv = System.Globalization.CultureInfo.InvariantCulture;
        await UpsertAsync("PointsPerSarEarned", request.PointsPerSarEarned.ToString(inv));
        await UpsertAsync("PointsPerSarRedeemed", request.PointsPerSarRedeemed.ToString(inv));
        await UpsertAsync("MinRedeemPoints", request.MinRedeemPoints.ToString(inv));
        await UpsertAsync("MaxRedeemPctOfTotal", request.MaxRedeemPctOfTotal.ToString(inv));
        await UpsertAsync("SilverThreshold", request.SilverThreshold.ToString(inv));
        await UpsertAsync("GoldThreshold", request.GoldThreshold.ToString(inv));
        await UpsertAsync("PlatinumThreshold", request.PlatinumThreshold.ToString(inv));
        await UpsertAsync("SilverMultiplier", request.SilverMultiplier.ToString(inv));
        await UpsertAsync("GoldMultiplier", request.GoldMultiplier.ToString(inv));
        await UpsertAsync("PlatinumMultiplier", request.PlatinumMultiplier.ToString(inv));
        await UpsertAsync("SilverDiscountPct", request.SilverDiscountPct.ToString(inv));
        await UpsertAsync("GoldDiscountPct", request.GoldDiscountPct.ToString(inv));
        await UpsertAsync("PlatinumDiscountPct", request.PlatinumDiscountPct.ToString(inv));
        await UpsertAsync("FreeDeliveryMinOrderSar", request.FreeDeliveryMinOrderSar.ToString(inv));
        await UpsertAsync("BirthdayBonusMultiplier", request.BirthdayBonusMultiplier.ToString(inv));
        await UpsertAsync("PointsExpiryMonths", request.PointsExpiryMonths.ToString(inv));
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "LOYALTY_CONFIG_CHANGED", "loyalty-config", userId: userId, newValue: request, cancellationToken: ct);

        return Ok(request);
    }

    private static LoyaltyProgramConfigDto ToDto(LoyaltyConfig c) => new(
        c.PointsPerSarEarned, c.PointsPerSarRedeemed, c.MinRedeemPoints, c.MaxRedeemPctOfTotal,
        c.SilverThreshold, c.GoldThreshold, c.PlatinumThreshold,
        c.SilverMultiplier, c.GoldMultiplier, c.PlatinumMultiplier,
        c.SilverDiscountPct, c.GoldDiscountPct, c.PlatinumDiscountPct,
        c.FreeDeliveryMinOrderSar, c.BirthdayBonusMultiplier, c.PointsExpiryMonths);

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

        var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
        return Ok(MapSummary(customer, recent, loyaltyConfig.PointsPerSarRedeemed));
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
        var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
        return Ok(MapSummary(customer, recent, loyaltyConfig.PointsPerSarRedeemed));
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
        // Module 7: tiers qualify on cumulative SAR spend, not points — a manual points correction
        // fixes the balance but never moves the customer's tier.
        var loyaltyConfigForTier = await db.GetLoyaltyConfigAsync(ct);
        customer.LoyaltyTier = LoyaltyRules.TierForLifetimeSpend(customer.LoyaltyLifetimeSpend, loyaltyConfigForTier);

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
        var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
        return Ok(MapSummary(customer, recent, loyaltyConfig.PointsPerSarRedeemed));
    }

    private int? CurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return claim is null ? null : int.Parse(claim);
    }

    private static CustomerLoyaltyDto MapSummary(Customer c, List<LoyaltyTransaction> recent, decimal pointsPerSarRedeemed) => new(
        c.Id, c.NameEn, c.LoyaltyEnrolled, c.LoyaltyPoints, LoyaltyRules.SarForPoints(c.LoyaltyPoints, pointsPerSarRedeemed),
        c.LoyaltyLifetimePoints, c.LoyaltyTier.ToString(), recent.Select(Map).ToList());

    private static LoyaltyTransactionDto Map(LoyaltyTransaction t) => new(
        t.Id, t.CustomerId, t.Customer?.NameEn ?? "", t.OrderId, t.Order?.OrderNo, t.BranchId, t.Branch?.NameEn,
        t.Type.ToString(), t.Points, t.Description, t.CreatedByUser?.Name, t.CreatedAt);
}
