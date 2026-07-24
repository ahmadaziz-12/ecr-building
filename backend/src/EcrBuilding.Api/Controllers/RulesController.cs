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

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<RuleDto>> Update(int id, UpsertRuleRequest request, CancellationToken ct)
    {
        var rule = await db.RuleDefinitions.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule is null) return NotFound();

        rule.Name = request.Name;
        rule.Domain = Enum.Parse<ModuleArea>(request.Domain);
        rule.Priority = request.Priority;
        rule.WhenTrigger = request.WhenTrigger;
        rule.Condition = request.Condition;
        rule.Action = request.Action;
        rule.ApproverUserId = request.ApproverUserId;
        rule.Active = request.Active;
        rule.Notes = request.Notes;
        rule.Status = request.Active ? EntityStatus.Active : EntityStatus.Inactive;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "RULE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);

        var approvers = rule.ApproverUserId is null ? [] : await db.Users.Where(u => u.Id == rule.ApproverUserId).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(Map(rule, approvers));
    }

    [HttpPost("{id:int}/test")]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<RuleTestResultDto>> Test(int id, CancellationToken ct)
    {
        var rule = await db.RuleDefinitions.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule is null) return NotFound();

        var messages = new List<string>();
        if (!rule.Active) messages.Add("Rule is inactive — it would not fire in production.");
        if (rule.ApproverUserId is int approverId)
        {
            var approver = await db.Users.FirstOrDefaultAsync(u => u.Id == approverId, ct);
            if (approver is null) messages.Add("Configured approver no longer exists.");
            else if (approver.Status != UserStatus.Active) messages.Add($"Approver \"{approver.Name}\" is {approver.Status} — approvals would stall.");
        }
        var conflicting = await db.RuleDefinitions
            .Where(r => r.Id != id && r.Domain == rule.Domain && r.Active && r.WhenTrigger == rule.WhenTrigger)
            .Select(r => r.Name)
            .ToListAsync(ct);
        if (conflicting.Count > 0) messages.Add($"Same trigger also active on: {string.Join(", ", conflicting)} — check priority order ({rule.Priority}).");
        if (string.IsNullOrWhiteSpace(rule.Condition) || string.IsNullOrWhiteSpace(rule.Action)) messages.Add("Condition or action text is empty.");
        if (messages.Count == 0) messages.Add("No conflicts found. Approver (if any) is active.");

        var passed = !messages.Any(m => m.Contains("no longer exists") || m.Contains("would stall") || m.Contains("empty"));
        await audit.LogAsync("admin", "RULE_TESTED", id.ToString(), newValue: new { passed, messages }, cancellationToken: ct);
        return Ok(new RuleTestResultDto(passed, messages));
    }

    private static RuleDto Map(RuleDefinition r, Dictionary<int, string> approvers) => new(
        r.Id, r.Name, r.Domain.ToString(), r.Priority, r.WhenTrigger, r.Condition, r.Action,
        r.ApproverUserId is not null && approvers.TryGetValue(r.ApproverUserId.Value, out var n) ? n : null, r.Active, r.Notes, r.Status.ToString());
}
