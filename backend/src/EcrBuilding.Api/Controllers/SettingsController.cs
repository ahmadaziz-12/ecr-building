using System.Security.Claims;
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
[Route("api/admin/settings")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class SettingsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<SettingDto>>> List([FromQuery] string category = "System", CancellationToken ct = default)
    {
        var settings = await db.Settings.Where(s => s.Category == category).OrderBy(s => s.Group).ThenBy(s => s.Key).ToListAsync(ct);
        var changerIds = settings.Where(s => s.ChangedByUserId != null).Select(s => s.ChangedByUserId!.Value).Distinct().ToList();
        var changers = await db.Users.Where(u => changerIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        return Ok(settings.Select(s => Map(s, changers)).ToList());
    }

    [HttpPut]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<SettingDto>> Upsert(UpsertSettingRequest request, CancellationToken ct)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        // BranchId is part of the identity of a setting row, not just a value on it — leaving it out
        // of the lookup meant saving a SECOND branch's override for the same Category/Group/Key
        // overwrote the first branch's row in place instead of creating an independent one (verified:
        // Riyadh's ReturnWindow.StandardDays=10 was silently replaced by Jeddah's =77 on the same row).
        var setting = await db.Settings.FirstOrDefaultAsync(
            s => s.Category == request.Category && s.Group == request.Group && s.Key == request.Key && s.BranchId == request.BranchId, ct);

        if (setting is null)
        {
            setting = new Setting { Category = request.Category, Group = request.Group, Key = request.Key, BranchId = request.BranchId };
            db.Settings.Add(setting);
        }

        setting.Value = request.Value;
        setting.Scope = Enum.Parse<SettingScope>(request.Scope);
        setting.EffectiveFrom = request.EffectiveFrom ?? DateTime.UtcNow;
        setting.ChangedByUserId = userId;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "SETTING_CHANGED", $"{request.Group}.{request.Key}", userId: userId, newValue: request, cancellationToken: ct);

        var changerName = (await db.Users.FindAsync([userId], ct))?.Name;
        return Ok(Map(setting, new Dictionary<int, string> { [userId] = changerName ?? "" }));
    }

    private static SettingDto Map(Setting s, Dictionary<int, string> changers) => new(
        s.Id, s.Category, s.Group, s.Key, s.Value, s.Scope.ToString(), s.BranchId, s.EffectiveFrom,
        s.ChangedByUserId is not null && changers.TryGetValue(s.ChangedByUserId.Value, out var n) ? n : null, s.Status.ToString());
}
