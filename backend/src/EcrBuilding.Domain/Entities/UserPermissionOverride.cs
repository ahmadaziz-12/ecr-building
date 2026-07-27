namespace EcrBuilding.Domain.Entities;

// Per-user override layered on top of the user's role's RolePermission grid for one page (ModuleKey).
// Each action is bool?: null means "inherit the role's value for that action", true/false is an
// explicit override. A row only needs to exist for a page where at least one action actually
// diverges from the role default — see PermissionResolver for the merge logic.
public class UserPermissionOverride
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public string ModuleKey { get; set; } = string.Empty;
    public bool? CanView { get; set; }
    public bool? CanCreate { get; set; }
    public bool? CanEdit { get; set; }
    public bool? CanDelete { get; set; }
    public bool? CanApprove { get; set; }
    public bool? CanExport { get; set; }
}
