using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace EcrBuilding.Infrastructure.Auth;

// Deliberately DB-backed rather than JWT-claim-based: baking ~55 pages x 6 actions into the access
// token would be both oversized and reintroduce exactly the staleness the per-user "Customize
// Permissions" feature promises not to have (effective on the very next request, no re-login). A
// short in-process cache keyed by the global PermissionsEpoch (bumped whenever any role or per-user
// override is saved — see RolesController/UsersController) keeps the hot path off the database
// between edits without needing a distributed cache or per-entry invalidation bookkeeping.
public class PermissionResolver(AppDbContext db, IMemoryCache cache) : IPermissionResolver
{
    private static readonly TimeSpan EntryTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan EpochTtl = TimeSpan.FromSeconds(10);

    public async Task<bool> HasAsync(int userId, string moduleKey, PermissionAction action, CancellationToken cancellationToken = default)
    {
        var grid = await GetEffectiveGridAsync(userId, cancellationToken);
        return grid.TryGetValue(moduleKey, out var cell) && cell.Get(action);
    }

    public async Task<Dictionary<string, PermissionCell>> GetEffectiveGridAsync(int userId, CancellationToken cancellationToken = default)
    {
        var epoch = await GetEpochAsync(cancellationToken);
        var grid = await cache.GetOrCreateAsync($"perm:{userId}:{epoch}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = EntryTtl;
            return await LoadEffectiveGridAsync(userId, cancellationToken);
        });
        return grid ?? new Dictionary<string, PermissionCell>();
    }

    public void InvalidateEpoch() => cache.Remove("perm:epoch");

    private Task<int> GetEpochAsync(CancellationToken cancellationToken) =>
        cache.GetOrCreateAsync("perm:epoch", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = EpochTtl;
            var row = await db.PermissionsEpochs.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
            return row?.Value ?? 0;
        });

    private async Task<Dictionary<string, PermissionCell>> LoadEffectiveGridAsync(int userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking()
            .Include(u => u.Role).ThenInclude(r => r!.Permissions)
            .Include(u => u.PermissionOverrides)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return new Dictionary<string, PermissionCell>();

        var grid = (user.Role?.Permissions ?? []).ToDictionary(
            p => p.ModuleKey,
            p => new PermissionCell(p.CanView, p.CanCreate, p.CanEdit, p.CanDelete, p.CanApprove, p.CanExport));

        foreach (var over in user.PermissionOverrides)
        {
            var basePerm = grid.TryGetValue(over.ModuleKey, out var existing) ? existing : PermissionCell.None;
            grid[over.ModuleKey] = new PermissionCell(
                over.CanView ?? basePerm.View,
                over.CanCreate ?? basePerm.Create,
                over.CanEdit ?? basePerm.Edit,
                over.CanDelete ?? basePerm.Delete,
                over.CanApprove ?? basePerm.Approve,
                over.CanExport ?? basePerm.Export);
        }

        return grid;
    }
}
