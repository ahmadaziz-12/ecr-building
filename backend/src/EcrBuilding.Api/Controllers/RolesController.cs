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
[Route("api/admin/roles")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class RolesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> List(CancellationToken ct)
    {
        var roles = await db.Roles.Include(r => r.Permissions).Include(r => r.Users).OrderBy(r => r.Name).ToListAsync(ct);
        return Ok(roles.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Admin, AccessLevel.Full)]
    public async Task<ActionResult<RoleDto>> Create(UpsertRoleRequest request, CancellationToken ct)
    {
        var role = new Role { Name = request.Name, Description = request.Description, ApprovalCap = request.ApprovalCap };
        role.Permissions = BuildPermissions(request.Permissions);
        db.Roles.Add(role);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "ROLE_CREATED", role.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(role));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Admin, AccessLevel.Full)]
    public async Task<ActionResult<RoleDto>> Update(int id, UpsertRoleRequest request, CancellationToken ct)
    {
        var role = await db.Roles.Include(r => r.Permissions).Include(r => r.Users).FirstOrDefaultAsync(r => r.Id == id, ct);
        if (role is null) return NotFound();

        role.Name = request.Name;
        role.Description = request.Description;
        role.ApprovalCap = request.ApprovalCap;
        db.RolePermissions.RemoveRange(role.Permissions);
        role.Permissions = BuildPermissions(request.Permissions);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "ROLE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(role));
    }

    private static List<RolePermission> BuildPermissions(Dictionary<string, string> map) =>
        map.Select(kv => new RolePermission
        {
            Module = Enum.Parse<ModuleArea>(kv.Key),
            Level = Enum.Parse<AccessLevel>(kv.Value),
        }).ToList();

    private static RoleDto Map(Role r) => new(
        r.Id, r.Name, r.Description, r.ApprovalCap, r.IsSystem, r.Status.ToString(), r.Users.Count,
        r.Permissions.Select(p => new ModulePermissionEntry(p.Module.ToString(), p.Level.ToString())).ToList());
}
