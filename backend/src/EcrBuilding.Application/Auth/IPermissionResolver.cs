using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Application.Auth;

// A single page's effective 6-action grid — role default with any per-user override already merged
// in (override wins per-action where it's non-null, else the role's value).
public readonly record struct PermissionCell(bool View, bool Create, bool Edit, bool Delete, bool Approve, bool Export)
{
    public static readonly PermissionCell None = new(false, false, false, false, false, false);

    public bool Get(PermissionAction action) => action switch
    {
        PermissionAction.View => View,
        PermissionAction.Create => Create,
        PermissionAction.Edit => Edit,
        PermissionAction.Delete => Delete,
        PermissionAction.Approve => Approve,
        PermissionAction.Export => Export,
        _ => false,
    };
}

// Resolves a user's effective per-page permission grid (role default merged with any
// UserPermissionOverride rows) per request — deliberately DB/cache-backed rather than baked into
// the JWT, so a "Customize Permissions" edit takes effect on the user's very next request without
// re-login. See PermissionResolver (Infrastructure) for the implementation/caching strategy.
public interface IPermissionResolver
{
    Task<bool> HasAsync(int userId, string moduleKey, PermissionAction action, CancellationToken cancellationToken = default);

    Task<Dictionary<string, PermissionCell>> GetEffectiveGridAsync(int userId, CancellationToken cancellationToken = default);

    // Called by RolesController/UsersController right after persisting a role or per-user override
    // change, so the epoch bump they just wrote to PermissionsEpoch is picked up immediately by this
    // same process instead of waiting out the epoch cache's own short TTL.
    void InvalidateEpoch();
}
