namespace EcrBuilding.Application.Abstractions;

// Reserved stock is a hold against BranchStockLevel — visible to Available (OnHand - Reserved) but
// not yet actually deducted. Held by quotations (from creation through Sent/Accepted) and parked
// sales, released on cancel/reject/expire/resume, and rolled into the real OnHand deduction at the
// point the stock is actually consumed (quotation convert / order checkout, which already respects
// other holders' Reserved via its own atomic (OnHand - Reserved) >= qty check).
public interface IStockReservationService
{
    // Atomically reserves qty for every (productId, qty) pair at the branch. Stops at — and returns
    // the ProductId of — the first line whose available stock (OnHand - Reserved) can't cover it.
    // The caller is expected to run this inside a transaction and roll it back on failure, since any
    // prior lines in this same call already committed their reservation.
    Task<int?> ReserveAsync(int branchId, IEnumerable<(int ProductId, decimal Qty)> lines, CancellationToken ct = default);

    // Best-effort release — never fails on its own. Used when un-reserving stock already known to
    // have been reserved (cancel/reject/expire/resume/convert), so a Reserved value that's already
    // drifted to 0 isn't an error.
    Task ReleaseAsync(int branchId, IEnumerable<(int ProductId, decimal Qty)> lines, CancellationToken ct = default);
}
