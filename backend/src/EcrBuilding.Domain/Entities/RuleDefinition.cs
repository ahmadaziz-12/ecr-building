using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class RuleDefinition : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public ModuleArea Domain { get; set; }
    public int Priority { get; set; }
    public string WhenTrigger { get; set; } = string.Empty;
    public string Condition { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public int? ApproverUserId { get; set; }
    public bool Active { get; set; } = true;
    public string? Notes { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}
