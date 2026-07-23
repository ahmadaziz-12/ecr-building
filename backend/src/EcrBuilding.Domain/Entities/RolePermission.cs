using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

// One row per (Role, ModuleArea) — the admin.roles page renders this as a matrix.
public class RolePermission
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public Role? Role { get; set; }
    public ModuleArea Module { get; set; }
    public AccessLevel Level { get; set; } = AccessLevel.None;
}
