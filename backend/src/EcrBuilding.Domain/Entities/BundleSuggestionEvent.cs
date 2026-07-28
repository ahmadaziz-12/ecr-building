namespace EcrBuilding.Domain.Entities;

// Phase 5 (BRD §5.5/§5.8): a bundle-suggestion impression at POS — Shown (the nudge appeared),
// Accepted (cashier added the bundle from it), or Rejected (cashier dismissed it). Feeds the
// Suggestion Report's conversion-rate math (BundleReportsController.BundleSuggestions). There is no
// richer "why" captured deliberately — this is a lightweight funnel counter, not an audit trail
// (AuditLog already exists for that and isn't indexed for this kind of per-bundle aggregation; see
// BundleReportsController's doc comment).
public enum BundleSuggestionEventType
{
    Shown,
    Accepted,
    Rejected,
}

public class BundleSuggestionEvent
{
    public int Id { get; set; }
    public int BundleId { get; set; }
    public ProductBundle? Bundle { get; set; }
    public BundleSuggestionEventType EventType { get; set; }
    public int? BranchId { get; set; }
    public int? UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
