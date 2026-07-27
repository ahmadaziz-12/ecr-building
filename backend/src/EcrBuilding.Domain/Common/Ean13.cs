namespace EcrBuilding.Domain.Common;

/// <summary>
/// BRD §2.2: barcodes are EAN-13 *or internal codes* — so validation only applies when the value
/// looks like an EAN-13 attempt (exactly 13 digits); anything else is treated as an internal code
/// and passes through untouched.
/// </summary>
public static class Ean13
{
    /// <summary>True when the value is not an EAN-13 attempt, or is a checksum-valid EAN-13.</summary>
    public static bool IsValidOrNotEan(string? barcode)
    {
        if (string.IsNullOrWhiteSpace(barcode)) return true;
        var trimmed = barcode.Trim();
        if (trimmed.Length != 13 || !trimmed.All(char.IsAsciiDigit)) return true; // internal code
        return HasValidChecksum(trimmed);
    }

    // Standard GS1 mod-10: odd positions ×1, even positions ×3 (1-based, left to right),
    // check digit makes the total a multiple of 10.
    public static bool HasValidChecksum(string thirteenDigits)
    {
        var sum = 0;
        for (var i = 0; i < 12; i++)
        {
            var digit = thirteenDigits[i] - '0';
            sum += i % 2 == 0 ? digit : digit * 3;
        }
        var check = (10 - sum % 10) % 10;
        return check == thirteenDigits[12] - '0';
    }
}
