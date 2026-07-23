namespace EcrBuilding.Domain.Entities;

public enum ComplianceStatus
{
    Compliant = 0,
    Overdue = 1
}

public class ComplianceControl : Common.BaseEntity
{
    public string Control { get; set; } = string.Empty;
    public string Framework { get; set; } = string.Empty;
    public string Owner { get; set; } = string.Empty;
    public DateTime LastReview { get; set; }
    public DateTime NextDue { get; set; }
    public string? Evidence { get; set; }
    public string? Findings { get; set; }
    public ComplianceStatus Status { get; set; } = ComplianceStatus.Compliant;
}
