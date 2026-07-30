using System.Security.Cryptography;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Infrastructure.Persistence.Seed;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize]
[RequireModule("/admin/users", PermissionAction.View)]
public class UsersController(AppDbContext db, IPasswordHasher hasher, IAuditService audit, IPermissionResolver permissionResolver) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> List(CancellationToken ct)
    {
        var users = await db.Users.Include(u => u.Role).Include(u => u.Branch).OrderBy(u => u.Name).ToListAsync(ct);
        return Ok(users.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/admin/users", PermissionAction.Create)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest request, CancellationToken ct)
    {
        if (await db.Users.AnyAsync(u => u.Email == request.Email, ct))
        {
            return Conflict(new { error = "A user with this email already exists." });
        }

        var user = new User
        {
            Name = request.Name,
            Email = request.Email,
            PasswordHash = hasher.Hash(request.Password),
            RoleId = request.RoleId,
            BranchId = request.BranchId,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "USER_CREATED", user.Id.ToString(), newValue: request, cancellationToken: ct);

        await db.Entry(user).Reference(u => u.Role).LoadAsync(ct);
        if (user.BranchId is not null) await db.Entry(user).Reference(u => u.Branch).LoadAsync(ct);
        return Ok(Map(user));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/admin/users", PermissionAction.Edit)]
    public async Task<ActionResult<UserDto>> Update(int id, UpdateUserRequest request, CancellationToken ct)
    {
        var user = await db.Users.Include(u => u.Role).Include(u => u.Branch).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();

        var old = Map(user);
        user.Name = request.Name;
        user.RoleId = request.RoleId;
        user.BranchId = request.BranchId;
        user.Status = Enum.Parse<UserStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await db.Entry(user).Reference(u => u.Role).LoadAsync(ct);
        if (user.BranchId is not null) await db.Entry(user).Reference(u => u.Branch).LoadAsync(ct);

        await audit.LogAsync("admin", "USER_UPDATED", id.ToString(), oldValue: old, newValue: Map(user), cancellationToken: ct);
        return Ok(Map(user));
    }

    [HttpPost("{id:int}/reset-pin")]
    [RequireModule("/admin/users", PermissionAction.Edit)]
    public async Task<ActionResult<ResetPinResponse>> ResetPin(int id, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();

        var pin = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        user.PinHash = hasher.Hash(pin);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "USER_PIN_RESET", id.ToString(), cancellationToken: ct);
        return Ok(new ResetPinResponse(pin));
    }

    // Powers the "Custom Permissions — {user}" dialog: the user's effective grid (role default with
    // Admin-only password rotation. Lets a System Admin change any account's password (including the
    // seeded admin) from the UI instead of editing appsettings/config on the server. The password is
    // returned exactly once so it can be handed to the account owner.
    [HttpPost("{id:int}/reset-password")]
    [RequireModule("/admin/users", PermissionAction.Edit)]
    public async Task<ActionResult<ResetPasswordResponse>> ResetPassword(int id, ResetPasswordRequest? request, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();

        var supplied = request?.NewPassword;
        var generated = string.IsNullOrWhiteSpace(supplied);
        if (!generated && supplied!.Trim().Length < 8)
        {
            return BadRequest(new { error = "Password must be at least 8 characters." });
        }

        var password = generated ? GeneratePassword() : supplied!.Trim();
        user.PasswordHash = hasher.Hash(password);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "USER_PASSWORD_RESET", id.ToString(), cancellationToken: ct);
        return Ok(new ResetPasswordResponse(password, generated));
    }

    private static string GeneratePassword()
    {
        // Ambiguous characters (O/0, l/1) omitted so the value survives being read aloud or retyped.
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        var buffer = new char[14];
        for (var i = 0; i < buffer.Length; i++)
        {
            buffer[i] = chars[RandomNumberGenerator.GetInt32(chars.Length)];
        }
        return new string(buffer) + "!" + RandomNumberGenerator.GetInt32(10, 100);
    }

    // Powers the "Custom Permissions — {user}" dialog: the user's effective grid (role default with
    // any existing override merged in) for every page, flagging which pages already carry an
    // explicit override so the UI can visually distinguish them from inherited role defaults.
    [HttpGet("{id:int}/permission-overrides")]
    public async Task<ActionResult<List<EffectivePermissionEntry>>> GetPermissionOverrides(int id, CancellationToken ct)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id, ct)) return NotFound();

        var grid = await permissionResolver.GetEffectiveGridAsync(id, ct);
        var overridden = (await db.UserPermissionOverrides.Where(o => o.UserId == id).Select(o => o.ModuleKey).ToListAsync(ct)).ToHashSet();

        var result = PermissionCatalog.Pages.Select(page =>
        {
            var cell = grid.TryGetValue(page.Key, out var c) ? c : PermissionCell.None;
            return new EffectivePermissionEntry(page.Key, cell.View, cell.Create, cell.Edit, cell.Delete, cell.Approve, cell.Export, overridden.Contains(page.Key));
        }).ToList();

        return Ok(result);
    }

    // Replace-on-save, same pattern as RolesController.Update: every existing override row for this
    // user is dropped and rebuilt from the payload. A row where every action is null carries no
    // actual override (full inherit) and is simply omitted from the rebuild.
    [HttpPut("{id:int}/permission-overrides")]
    [RequireModule("/admin/users", PermissionAction.Edit)]
    public async Task<ActionResult<List<EffectivePermissionEntry>>> SavePermissionOverrides(int id, List<UserPermissionOverrideEntry> request, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();

        var invalidKeys = request.Select(e => e.Module).Where(k => !PermissionCatalog.ValidKeys.Contains(k)).ToList();
        if (invalidKeys.Count > 0)
        {
            return BadRequest(new { error = $"Unknown page(s): {string.Join(", ", invalidKeys)}" });
        }

        var existing = await db.UserPermissionOverrides.Where(o => o.UserId == id).ToListAsync(ct);
        db.UserPermissionOverrides.RemoveRange(existing);

        var rows = request
            .Where(e => e.CanView is not null || e.CanCreate is not null || e.CanEdit is not null
                || e.CanDelete is not null || e.CanApprove is not null || e.CanExport is not null)
            .Select(e => new UserPermissionOverride
            {
                UserId = id,
                ModuleKey = e.Module,
                CanView = e.CanView,
                CanCreate = e.CanCreate,
                CanEdit = e.CanEdit,
                CanDelete = e.CanDelete,
                CanApprove = e.CanApprove,
                CanExport = e.CanExport,
            }).ToList();
        db.UserPermissionOverrides.AddRange(rows);

        var epoch = await db.PermissionsEpochs.FirstOrDefaultAsync(ct);
        if (epoch is null) db.PermissionsEpochs.Add(new PermissionsEpoch { Value = 1 });
        else epoch.Value++;

        await db.SaveChangesAsync(ct);
        permissionResolver.InvalidateEpoch();
        // Log the plain request DTOs, not the EF-tracked `rows` entities — those get a `User`
        // back-reference auto-wired by change tracking (the User is already tracked from the lookup
        // above), and User.PermissionOverrides -> User -> PermissionOverrides -> ... is a cycle the
        // JSON serializer can't handle.
        await audit.LogAsync("admin", "USER_PERMISSIONS_CUSTOMIZED", id.ToString(), newValue: request, cancellationToken: ct);

        return await GetPermissionOverrides(id, ct);
    }

    private static UserDto Map(User u) => new(
        u.Id, u.Name, u.Email, u.RoleId, u.Role?.Name ?? "", u.BranchId, u.Branch?.NameEn, u.Status.ToString(), u.PreferredLocale, u.LastLoginAt,
        u.PinHash is not null, u.BiometricEnabled);
}
