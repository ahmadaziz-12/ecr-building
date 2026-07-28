namespace EcrBuilding.Domain.Entities;

// One row per (Role, page). ModuleKey mirrors the frontend route path in AppLayout.tsx's nav array
// (e.g. "stock/warehouses", "admin/roles") — the exact same string is used on both sides so there is
// no separate module enum/catalog to keep in sync as pages are added.
public class RolePermission
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public Role? Role { get; set; }
    public string ModuleKey { get; set; } = string.Empty;
    public bool CanView { get; set; }
    public bool CanCreate { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanApprove { get; set; }
    public bool CanExport { get; set; }
}
