namespace EcrBuilding.Application.Pos;

// Payload PosSessionHub relays between a cashier's PosCheckout tab and a paired customer-facing
// display. The hub never prices anything itself — these numbers are whatever the cashier's own
// screen already computed (the same totals OrdersController.Checkout re-validates at charge time),
// so there is no second pricing engine here to keep in sync.
public record CustomerDisplayLineDto(string Name, decimal Qty, string Uom, decimal UnitPrice, decimal LineTotal);

// A single breakdown row under the subtotal — contractor/tier discount, trade value, coupon/manual
// discount, a delivery fee, etc. — mirrors the labeled rows PosCheckout's own summary panel shows.
public record CustomerDisplayAmountLineDto(string Label, decimal Amount);

public record CustomerDisplaySnapshotDto(
    string Status, // "Idle" | "Building" | "Processing" | "Approved"
    IReadOnlyList<CustomerDisplayLineDto> Lines,
    decimal Subtotal,
    IReadOnlyList<CustomerDisplayAmountLineDto> Discounts,
    IReadOnlyList<CustomerDisplayAmountLineDto> Fees,
    decimal Vat,
    decimal Total,
    string? CustomerName = null,
    string? OrderNo = null,
    // BRD §4.3.3: same loyalty tier + points (+ SAR equivalent) PosCheckout's own customer card shows
    // — null/absent when no customer is attached to the sale, or the customer isn't loyalty-enrolled.
    string? CustomerLoyaltyTier = null,
    int? CustomerLoyaltyPoints = null,
    decimal? CustomerLoyaltyPointsSarValue = null);
