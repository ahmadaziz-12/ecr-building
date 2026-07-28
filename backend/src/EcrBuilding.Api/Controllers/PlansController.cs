using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Admin;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/admin/plans")]
[Authorize]
[RequireModule("/admin/plans", PermissionAction.View)]
public class PlansController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<PlanDto>>> ListPlans(CancellationToken ct)
    {
        var plans = await db.Plans.OrderBy(p => p.MonthlyPrice).ToListAsync(ct);
        return Ok(plans.Select(p => new PlanDto(
            p.Id, p.Name, p.MonthlyPrice, p.YearlyPrice, p.MaxBranches, p.MaxTerminals, p.MaxUsers, p.MaxSkus,
            JsonSerializer.Deserialize<List<string>>(p.FeaturesJson) ?? [], p.Status.ToString())).ToList());
    }

    [HttpGet("subscription")]
    public async Task<ActionResult<SubscriptionDto>> CurrentSubscription(CancellationToken ct)
    {
        var sub = await db.CompanySubscriptions.Include(s => s.Plan).OrderByDescending(s => s.Id).FirstOrDefaultAsync(ct);
        if (sub is null) return NotFound();

        var usage = await db.PlanUsageEntitlements.Where(u => u.SubscriptionId == sub.Id).ToListAsync(ct);
        return Ok(new SubscriptionDto(
            sub.Id, sub.Plan?.Name ?? "", sub.BillingCycle.ToString(), sub.StartedAt, sub.RenewsAt, sub.Status.ToString(),
            usage.Select(u => new UsageEntitlementDto(u.Feature, u.Usage, u.Limit, u.OverageRate, u.NextResetAt)).ToList()));
    }
}
