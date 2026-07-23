using EcrBuilding.Api.Authorization;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

public record AuditLogDto(int Id, DateTime CreatedAt, string Module, string Event, string? RecordId, string? UserName, int? BranchId, string Severity);

[ApiController]
[Route("api/admin/audit-logs")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class AuditLogsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AuditLogDto>>> List([FromQuery] string? module, CancellationToken ct)
    {
        var query = db.AuditLogs.AsQueryable();
        if (!string.IsNullOrWhiteSpace(module)) query = query.Where(a => a.Module == module);

        var rows = await query.OrderByDescending(a => a.CreatedAt).Take(300).ToListAsync(ct);
        return Ok(rows.Select(a => new AuditLogDto(a.Id, a.CreatedAt, a.Module, a.Event, a.RecordId, a.UserName, a.BranchId, a.Severity.ToString())).ToList());
    }
}
