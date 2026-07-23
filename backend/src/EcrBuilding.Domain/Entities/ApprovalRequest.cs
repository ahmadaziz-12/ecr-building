using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum ApprovalType { Discount = 0, PriceOverride = 1, Refund = 2 }
public enum ApprovalStatus { Pending = 0, Approved = 1, Rejected = 2 }

public class ApprovalRequest : BaseEntity
{
    public ApprovalType Type { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int RequestedByUserId { get; set; }
    public User? RequestedBy { get; set; }
    public int? ApproverUserId { get; set; }
    public User? Approver { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public ApprovalStatus Status { get; set; } = ApprovalStatus.Pending;
    public int? RelatedOrderId { get; set; }
    public Order? RelatedOrder { get; set; }
    public DateTime? ResolvedAt { get; set; }
}
