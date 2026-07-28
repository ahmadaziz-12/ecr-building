using System.Security.Claims;
using EcrBuilding.Application.Auth;
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
public class AuditLogsController(AppDbContext db, IPermissionResolver permissionResolver) : ControllerBase
{
    // AuditLog.Module is a free-text category (the string passed to IAuditService.LogAsync, e.g.
    // "delivery", "pos", "finance") — not a page key. A scoped request (e.g. Delivery's own Activity
    // Logs page passing module=delivery) only needs View on that category's representative page;
    // the unfiltered admin.audit-logs list (no module, or an unrecognized one) requires View on the
    // Audit Logs page itself.
    private static readonly Dictionary<string, string> CategoryPage = new(StringComparer.OrdinalIgnoreCase)
    {
        ["pos"] = "/operate/pos-checkout",
        ["orders"] = "/operate/orders",
        ["inventory"] = "/stock/inventory",
        ["finance"] = "/finance/expenses",
        ["delivery"] = "/delivery/orders",
        ["hr"] = "/hrms/employees",
        ["insights"] = "/insights/reports",
        ["suppliers"] = "/suppliers/suppliers",
        ["network"] = "/network/branches",
        ["admin"] = "/admin/audit-logs",
    };

    [HttpGet]
    public async Task<ActionResult<List<AuditLogDto>>> List([FromQuery] string? module, CancellationToken ct)
    {
        var requiredPage = !string.IsNullOrWhiteSpace(module) && CategoryPage.TryGetValue(module, out var mapped)
            ? mapped
            : "/admin/audit-logs";

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await permissionResolver.HasAsync(userId, requiredPage, PermissionAction.View, ct))
        {
            return StatusCode(403, new { error = $"You don't have View access to {requiredPage}." });
        }

        var query = db.AuditLogs.AsQueryable();
        if (!string.IsNullOrWhiteSpace(module)) query = query.Where(a => a.Module == module);

        var rows = await query.OrderByDescending(a => a.CreatedAt).Take(300).ToListAsync(ct);
        return Ok(rows.Select(a => new AuditLogDto(a.Id, a.CreatedAt, a.Module, a.Event, a.RecordId, a.UserName, a.BranchId, a.Severity.ToString())).ToList());
    }
}
