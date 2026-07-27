namespace EcrBuilding.Domain.Common;

/// <summary>
/// BRD §2.3 UOM engine math, kept pure/static so it is unit-testable in isolation and cannot drift
/// between the places that need it (checkout, void restore, quotation conversion).
/// Convention: a conversion factor means "1 selling-UOM = factor stock-UOM" (1 Pallet = 50 Bag).
/// </summary>
public static class UomMath
{
    /// <summary>
    /// Resolves the selling→stock factor. Returns 1 when selling in the stock UOM itself, the
    /// configured factor when a conversion exists (case-insensitive match), and null when the UOM is
    /// unknown for this product — callers must treat null as a hard error, never a silent 1:1.
    /// </summary>
    public static decimal? FactorToStock(string sellUom, string stockUom, IEnumerable<(string Uom, decimal Factor)> conversions)
    {
        sellUom = sellUom.Trim();
        if (string.Equals(sellUom, stockUom, StringComparison.OrdinalIgnoreCase)) return 1m;
        foreach (var (uom, factor) in conversions)
        {
            if (string.Equals(uom, sellUom, StringComparison.OrdinalIgnoreCase))
            {
                return factor > 0 ? factor : null;
            }
        }
        return null;
    }

    // AwayFromZero, not .NET's default banker's rounding — a customer quoted 0.5625 m² expects to be
    // billed 0.563, matching how every receipt total in this codebase rounds.
    /// <summary>Entered quantity in selling UOM → quantity to deduct from stock, in stock UOM.</summary>
    public static decimal ToStockQty(decimal qty, decimal factorToStock) =>
        Math.Round(qty * factorToStock, 3, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Cut-to-size area from entered dimensions in metres (BRD §2.3 item 5) — 3dp keeps millimetre
    /// precision on the computed m² without pretending to more accuracy than a tape measure has.
    /// </summary>
    public static decimal AreaOf(decimal lengthM, decimal widthM) =>
        Math.Round(lengthM * widthM, 3, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Cut-to-size linear length (BRD §2.3: cable/pipe cut to a single length, no width) — rounded
    /// the same way as AreaOf/VolumeOf so a length-mode line's billed qty follows the same precision
    /// convention as every other cut-to-size mode.
    /// </summary>
    public static decimal LengthOf(decimal lengthM) =>
        Math.Round(lengthM, 3, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Cut-to-size volume from entered dimensions in metres (BRD §2.3: timber/sand sold by m³).
    /// </summary>
    public static decimal VolumeOf(decimal lengthM, decimal widthM, decimal heightM) =>
        Math.Round(lengthM * widthM * heightM, 3, MidpointRounding.AwayFromZero);
}
