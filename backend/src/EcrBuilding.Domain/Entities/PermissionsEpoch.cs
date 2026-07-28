namespace EcrBuilding.Domain.Entities;

// Single-row global counter, bumped whenever any role's permissions or any user's permission
// overrides are saved. PermissionResolver's cache key embeds this value, so an edit invalidates
// every cached permission lookup for the very next request without a distributed cache or
// per-entry invalidation bookkeeping.
public class PermissionsEpoch
{
    public int Id { get; set; }
    public int Value { get; set; }
}
