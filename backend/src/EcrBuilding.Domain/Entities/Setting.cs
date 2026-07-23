using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Setting : BaseEntity
{
    // "System" (admin.settings) or "Pos" (admin.pos-settings)
    public string Category { get; set; } = "System";
    public string Group { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public SettingScope Scope { get; set; } = SettingScope.Global;
    public int? BranchId { get; set; }
    public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
    public int? ChangedByUserId { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}
