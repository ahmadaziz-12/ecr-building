using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Infrastructure.Persistence.Seed;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// BRD §10.1 caps the roster at exactly 5 roles (Cashier, Senior Cashier, Supervisor, Store Manager,
// System Admin) — DbSeeder.EnsureExactlyFiveBrdRolesAsync enforces this at the data layer, and there
// is deliberately no Create/Delete endpoint here: the 5 rows always exist and can only be edited.
[ApiController]
[Route("api/admin/roles")]
[Authorize]
[RequireModule("/admin/roles", PermissionAction.View)]
public class RolesController(AppDbContext db, IAuditService audit, IPermissionResolver permissionResolver) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> List(CancellationToken ct)
    {
        var roles = await db.Roles.Include(r => r.Permissions).Include(r => r.Users).OrderBy(r => r.Name).ToListAsync(ct);
        return Ok(roles.Select(Map).ToList());
    }

    [HttpGet("{id:int}/users")]
    public async Task<ActionResult<List<RoleMemberDto>>> Members(int id, CancellationToken ct)
    {
        var members = await db.Users.Where(u => u.RoleId == id).OrderBy(u => u.Name)
            .Select(u => new RoleMemberDto(u.Id, u.Name, u.Email, u.Status.ToString()))
            .ToListAsync(ct);
        return Ok(members);
    }

    [HttpPut("{id:int}")]
    [RequireModule("/admin/roles", PermissionAction.Edit)]
    public async Task<ActionResult<RoleDto>> Update(int id, UpsertRoleRequest request, CancellationToken ct)
    {
        var role = await db.Roles.Include(r => r.Permissions).Include(r => r.Users).FirstOrDefaultAsync(r => r.Id == id, ct);
        if (role is null) return NotFound();

        var invalidKeys = request.Permissions.Select(p => p.Module).Where(k => !PermissionCatalog.ValidKeys.Contains(k)).ToList();
        if (invalidKeys.Count > 0)
        {
            return BadRequest(new { error = $"Unknown page(s): {string.Join(", ", invalidKeys)}" });
        }

        role.Description = request.Description;
        role.ApprovalCap = request.ApprovalCap;
        db.RolePermissions.RemoveRange(role.Permissions);
        role.Permissions = BuildPermissions(request.Permissions);
        ApplyPosCeilings(role, request.PosCeilings);
        await BumpPermissionsEpochAsync(ct);
        await db.SaveChangesAsync(ct);
        permissionResolver.InvalidateEpoch();
        await audit.LogAsync("admin", "ROLE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(role));
    }

    // Every page-permission edit (here and UsersController's override endpoints) must call this so
    // PermissionResolver's per-user cache — keyed by this value — misses on the very next request
    // instead of serving a stale grid for up to its 5-minute TTL.
    private async Task BumpPermissionsEpochAsync(CancellationToken ct)
    {
        var epoch = await db.PermissionsEpochs.FirstOrDefaultAsync(ct);
        if (epoch is null)
        {
            db.PermissionsEpochs.Add(new PermissionsEpoch { Value = 1 });
        }
        else
        {
            epoch.Value++;
        }
    }

    private static List<RolePermission> BuildPermissions(IReadOnlyList<ModulePermissionEntry> entries) =>
        entries.Select(e => new RolePermission
        {
            ModuleKey = e.Module,
            CanView = e.CanView,
            CanCreate = e.CanCreate,
            CanEdit = e.CanEdit,
            CanDelete = e.CanDelete,
            CanApprove = e.CanApprove,
            CanExport = e.CanExport,
        }).ToList();

    private static void ApplyPosCeilings(Role role, PosCeilingsDto ceilings)
    {
        role.DiscountCeilingPercent = ceilings.DiscountCeilingPercent;
        role.SurplusReturnCeilingAmount = ceilings.SurplusReturnCeilingAmount;
        role.CanAuthorizeStandardReturnWithoutReceipt = ceilings.CanAuthorizeStandardReturnWithoutReceipt;
        role.CanOverrideItemPrice = ceilings.CanOverrideItemPrice;
        role.CanAuthorizeDamagedReturns = ceilings.CanAuthorizeDamagedReturns;
        role.CanVoidTransactions = ceilings.CanVoidTransactions;
        role.CanViewXReport = ceilings.CanViewXReport;
        role.CanViewZReport = ceilings.CanViewZReport;
        role.CanConfigureReturnRulesAndFees = ceilings.CanConfigureReturnRulesAndFees;
        role.CanManagePriceListAndUsers = ceilings.CanManagePriceListAndUsers;
        role.CanManageSystemConfiguration = ceilings.CanManageSystemConfiguration;
    }

    private static RoleDto Map(Role r) => new(
        r.Id, r.Name, r.Description, r.ApprovalCap, r.IsSystem, r.Status.ToString(), r.Users.Count,
        r.Permissions.Select(p => new ModulePermissionEntry(p.ModuleKey, p.CanView, p.CanCreate, p.CanEdit, p.CanDelete, p.CanApprove, p.CanExport)).ToList(),
        new PosCeilingsDto(
            r.DiscountCeilingPercent, r.SurplusReturnCeilingAmount, r.CanAuthorizeStandardReturnWithoutReceipt,
            r.CanOverrideItemPrice, r.CanAuthorizeDamagedReturns, r.CanVoidTransactions, r.CanViewXReport,
            r.CanViewZReport, r.CanConfigureReturnRulesAndFees, r.CanManagePriceListAndUsers, r.CanManageSystemConfiguration));
}
