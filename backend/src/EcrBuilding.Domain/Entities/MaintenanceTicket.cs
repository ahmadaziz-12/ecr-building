using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public enum MaintenanceStatus
{
    Open = 0,
    InProgress = 1,
    Resolved = 2,
    Closed = 3
}

public class MaintenanceTicket : BaseEntity
{
    public string TicketNo { get; set; } = string.Empty;
    public string DeviceOrModule { get; set; } = string.Empty;
    public int? BranchId { get; set; }
    public Branch? Branch { get; set; }
    public AuditSeverity Severity { get; set; } = AuditSeverity.Warning;
    public string Owner { get; set; } = string.Empty;
    public int SlaHours { get; set; } = 24;
    public MaintenanceStatus Status { get; set; } = MaintenanceStatus.Open;
    public DateTime? ResolvedAt { get; set; }
}
