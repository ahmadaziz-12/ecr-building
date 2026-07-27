namespace EcrBuilding.Domain.Enums;

// The 6 independently-grantable actions on a page-level permission (RolePermission /
// UserPermissionOverride). Deliberately NOT ordinal/flags — a role can grant View+Export without
// Edit, so callers check exactly the action they need rather than a "minimum level".
public enum PermissionAction
{
    View,
    Create,
    Edit,
    Delete,
    Approve,
    Export
}
