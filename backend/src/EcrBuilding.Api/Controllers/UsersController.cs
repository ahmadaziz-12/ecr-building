using System.Security.Cryptography;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EcrBuilding.Infrastructure.Persistence;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class UsersController(AppDbContext db, IPasswordHasher hasher, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> List(CancellationToken ct)
    {
        var users = await db.Users.Include(u => u.Role).Include(u => u.Branch).OrderBy(u => u.Name).ToListAsync(ct);
        return Ok(users.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
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
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
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
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
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

    private static UserDto Map(User u) => new(
        u.Id, u.Name, u.Email, u.RoleId, u.Role?.Name ?? "", u.BranchId, u.Branch?.NameEn, u.Status.ToString(), u.PreferredLocale, u.LastLoginAt,
        u.PinHash is not null);
}
