using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum ApprovalType
{
    Discount = 0, PriceOverride = 1, Refund = 2, CreditOverride = 3, DeliveryStageChange = 4, DeliverySplit = 5,
    // Approval Center: sensitive post-checkout actions a cashier without the matching posCeiling
    // can't take alone — a different, higher-tier user must approve before OrdersController's
    // Delete / ChangePaymentMethod / DeleteLine endpoints will act on the request.
    InvoiceDeletion = 6, PaymentMethodChange = 7, ItemDeletion = 8,
}
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
    // DeliveryStageChange / DeliverySplit only: the delivery order the request applies to, and the
    // original TransitionRequest / CreateDeliverySplitRequest (JSON) to replay unchanged once a
    // Full-access approver signs off on it.
    public int? RelatedDeliveryOrderId { get; set; }
    public DeliveryOrder? RelatedDeliveryOrder { get; set; }
    // ItemDeletion only: which line of RelatedOrderId this request covers — a completed order can
    // have more than one line pending deletion at once, each needing its own approval.
    public int? RelatedOrderLineId { get; set; }
    public OrderLine? RelatedOrderLine { get; set; }
    public string? Payload { get; set; }
    public DateTime? ResolvedAt { get; set; }
}
