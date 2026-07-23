using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

// Generalized audit trail across every module — deliberately not capped/paginated only.
public class AuditLog
{
    public int Id { get; set; }
    public string Module { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;
    public string? RecordId { get; set; }
    public int? UserId { get; set; }
    public string? UserName { get; set; }
    public int? EmployeeId { get; set; }
    public int? BranchId { get; set; }
    public int? DeviceId { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public string? Reason { get; set; }
    public AuditSeverity Severity { get; set; } = AuditSeverity.Info;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
