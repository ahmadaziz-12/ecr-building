using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/admin/rules")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class RulesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<RuleDto>>> List(CancellationToken ct)
    {
        var rules = await db.RuleDefinitions.OrderByDescending(r => r.Priority).ToListAsync(ct);
        var approverIds = rules.Where(r => r.ApproverUserId != null).Select(r => r.ApproverUserId!.Value).Distinct().ToList();
        var approvers = await db.Users.Where(u => approverIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(rules.Select(r => Map(r, approvers)).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<RuleDto>> Create(UpsertRuleRequest request, CancellationToken ct)
    {
        var rule = new RuleDefinition
        {
            Name = request.Name, Domain = Enum.Parse<ModuleArea>(request.Domain), Priority = request.Priority,
            WhenTrigger = request.WhenTrigger, Condition = request.Condition, Action = request.Action,
            ApproverUserId = request.ApproverUserId, Active = request.Active, Notes = request.Notes,
        };
        db.RuleDefinitions.Add(rule);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "RULE_CREATED", rule.Id.ToString(), newValue: request, cancellationToken: ct);
        var approvers = rule.ApproverUserId is null ? [] : await db.Users.Where(u => u.Id == rule.ApproverUserId).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(Map(rule, approvers));
    }

    private static RuleDto Map(RuleDefinition r, Dictionary<int, string> approvers) => new(
        r.Id, r.Name, r.Domain.ToString(), r.Priority, r.WhenTrigger, r.Condition, r.Action,
        r.ApproverUserId is not null && approvers.TryGetValue(r.ApproverUserId.Value, out var n) ? n : null, r.Active, r.Notes, r.Status.ToString());
}
