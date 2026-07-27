namespace EcrBuilding.Domain.Enums;

// Broad business-domain categorization used ONLY by RuleDefinition.Domain (the Rules Engine's own
// dropdown). RBAC page permissions (RolePermission/UserPermissionOverride) key off a page's route
// string directly instead — see PermissionCatalog — so this enum no longer drives the roles matrix.
public enum ModuleArea
{
    Pos = 0,
    Orders = 1,
    Inventory = 2,
    Finance = 3,
    Admin = 4,
    Delivery = 5,
    Hr = 6,
    Insights = 7,
    Suppliers = 8,
    Network = 9
}
