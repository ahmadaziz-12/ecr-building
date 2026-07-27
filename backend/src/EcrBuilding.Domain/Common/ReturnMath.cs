namespace EcrBuilding.Domain.Common;

/// <summary>
/// BRD §3.2 refund math, pure/static so the preview endpoint, creation, approval, GL posting, and
/// tests all compute cashback from one place. Convention: refunds are priced at what the customer
/// ACTUALLY paid per unit on the original line (unit price after its line discount — BRD §3.2.2
/// "full original unit price paid including any discount applied at time of sale"), with VAT reversed
/// at the line's own rate and any restocking fee deducted from the cashback only — never from the
/// physical stock quantity reintegrated.
/// </summary>
public static class ReturnMath
{
    public readonly record struct LineRefund(decimal BaseRefund, decimal VatReversal);

    /// <summary>Refund for returning <paramref name="qtyReturned"/> of a line that sold lineQty for lineTotal (ex VAT).</summary>
    public static LineRefund RefundForLine(decimal qtyReturned, decimal lineQty, decimal lineTotal, decimal vatRate)
    {
        if (lineQty <= 0) return new LineRefund(0, 0);
        var baseRefund = Round2(qtyReturned * (lineTotal / lineQty));
        var vatReversal = Round2(baseRefund * vatRate / 100m);
        return new LineRefund(baseRefund, vatReversal);
    }

    public static decimal RestockingFee(decimal baseRefund, decimal feePct) => Round2(baseRefund * feePct / 100m);

    public static decimal NetCashback(decimal grossRefund, decimal vatReversal, decimal restockingFee) =>
        Round2(grossRefund + vatReversal - restockingFee);

    /// <summary>
    /// BRD §3.2.4: mixed-method original payments split the cashback proportionally by default.
    /// Rounding remainders land on the largest original payment so the split always sums exactly
    /// to the refund total.
    /// </summary>
    public static IReadOnlyList<(string Method, decimal Amount)> ProportionalSplit(
        IReadOnlyList<(string Method, decimal Amount)> originalPayments, decimal refundTotal)
    {
        var paid = originalPayments.Where(p => p.Amount > 0).ToList();
        var paidTotal = paid.Sum(p => p.Amount);
        if (paidTotal <= 0 || refundTotal <= 0) return [];

        var split = paid.Select(p => (p.Method, Amount: Round2(refundTotal * p.Amount / paidTotal))).ToList();
        var drift = Round2(refundTotal - split.Sum(s => s.Amount));
        if (drift != 0)
        {
            var largestIndex = split.IndexOf(split.OrderByDescending(s => s.Amount).First());
            split[largestIndex] = (split[largestIndex].Method, Round2(split[largestIndex].Amount + drift));
        }
        return split;
    }

    private static decimal Round2(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
