using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
    public decimal ApprovalCap { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<RolePermission> Permissions { get; set; } = new List<RolePermission>();
    public ICollection<User> Users { get; set; } = new List<User>();
}
