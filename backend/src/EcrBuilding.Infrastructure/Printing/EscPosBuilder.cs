using System.Linq;
using System.Text;
using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Infrastructure.Printing;

public record ReceiptPayload(string EscPosBase64, string PreviewText);

// Real ESC/POS byte builder (init, center/bold/double-size, two-column rows, QR, cut) — ported
// structure-for-structure from the reference project's PrinterController::BuildEscPos (padded
// Row()/Divider() layout, 48-char width) since this project has no physical printer to visually
// tune against directly.
public static class EscPosBuilder
{
    private const int Width = 48;
    private const byte Esc = 0x1B;
    private const byte Gs = 0x1D;

    public static ReceiptPayload BuildReceipt(Order order, string branchName, string? vatRegistrationNumber, string? qrCodeBase64)
    {
        using var bytes = new MemoryStream();
        var preview = new StringBuilder();

        void Raw(params byte[] b) => Write(bytes, b);
        void Text(string s) { WriteText(bytes, ToPrintableAscii(s)); preview.Append(s); }
        void Lf(int n = 1) { for (var i = 0; i < n; i++) { Raw(0x0A); preview.Append('\n'); } }
        void Center() => Raw(Esc, (byte)'a', 1);
        void Left() => Raw(Esc, (byte)'a', 0);
        void Bold(bool on) => Raw(Esc, (byte)'E', (byte)(on ? 1 : 0));
        void DoubleSize(bool on) => Raw(Gs, (byte)'!', (byte)(on ? 0x11 : 0x00));
        void Divider() { Text(new string('-', Width)); Lf(); }
        string PadRow(string left, string right)
        {
            var space = Width - left.Length - right.Length;
            return space > 0 ? left + new string(' ', space) + right : left + " " + right;
        }
        void Row(string left, string right) { Text(PadRow(left, right)); Lf(); }

        Raw(Esc, (byte)'@'); // init

        // BRD §7.3: the cash drawer opens automatically on cash payment completion — the RJ-11
        // drawer hangs off the printer, so the kick is an ESC p pulse at the top of the receipt job
        // (pin 2, 100ms on / 250ms off). Non-cash sales print without the pulse.
        if (order.Payments.Any(p => p.Method == PaymentMethod.Cash))
        {
            Raw(Esc, (byte)'p', 0x00, 0x32, 0x7D);
        }

        // Header
        Center(); Bold(true); DoubleSize(true);
        var name = branchName.Length > 24 ? branchName[..24] : branchName.PadLeft((24 + branchName.Length) / 2);
        Text(name); Lf();
        DoubleSize(false); Bold(false);

        if (!string.IsNullOrWhiteSpace(vatRegistrationNumber))
        {
            Text($"VAT: {vatRegistrationNumber}"); Lf();
        }
        Text("TAX INVOICE"); Lf();
        Left();
        Divider();

        // Order info
        Text(order.OrderNo); Lf();
        Text(order.CreatedAt.ToString("dd/MM/yyyy  HH:mm")); Lf();
        if (order.Customer is not null)
        {
            Text($"Customer: {order.Customer.NameEn}"); Lf();
        }
        Divider();

        // Items
        foreach (var line in order.Lines)
        {
            var itemName = line.Product?.NameEn ?? "Item";
            Text(itemName.Length > Width ? itemName[..Width] : itemName); Lf();
            var qtyPrice = $"  {line.Qty:0.####} x SAR {line.UnitPrice:F2}";
            // Prints which discount (contractor/tier rate or a Quantity pricing rule threshold —
            // whichever applied is already baked into DiscountPct) actually reduced this specific
            // line, not just the order-wide total below.
            if (line.DiscountPct > 0) qtyPrice += $" (-{line.DiscountPct:0.#}%)";
            Row(qtyPrice, $"SAR {line.LineTotal:F2}");
        }
        Divider();

        // Totals
        Row("Subtotal", $"SAR {order.SubTotal:F2}");
        if (order.DiscountTotal > 0) Row("Discount", $"-SAR {order.DiscountTotal:F2}");
        foreach (var fee in order.Fees) Row(fee.Label, $"SAR {fee.Amount:F2}");
        Row("VAT", $"SAR {order.VatTotal:F2}");

        Divider();
        Bold(true); DoubleSize(true);
        Row("TOTAL", $"SAR {order.GrandTotal:F2}");
        DoubleSize(false); Bold(false);

        // Payment
        foreach (var payment in order.Payments)
        {
            Row(payment.Method.ToString(), $"SAR {payment.Amount:F2}");
        }

        // Footer
        Divider();
        Center();
        Text("Thank you!"); Lf();
        Text("ZATCA Phase 2 Compliant"); Lf();
        Lf();

        if (qrCodeBase64 is not null)
        {
            // GS ( k — print QR code (model 2, size 6, error-correction M), matching the real ESC/POS QR command block.
            // The symbol must encode the base64 TEXT itself (same as the on-screen <QRCodeSVG value=qrCodeBase64/>
            // component) — NOT its decoded bytes. A scanner reading a QR built from the decoded bytes gets back
            // the raw TLV (garbled binary in tags 8/9) instead of the clean base64 string ZATCA's own reader expects.
            var qrBytes = Encoding.ASCII.GetBytes(qrCodeBase64);
            Raw(Gs, (byte)'(', (byte)'k', 4, 0, 49, 65, 50, 0);
            Raw(Gs, (byte)'(', (byte)'k', 3, 0, 49, 67, 6);
            Raw(Gs, (byte)'(', (byte)'k', 3, 0, 49, 69, 49);
            var storeLenLow = (byte)((qrBytes.Length + 3) & 0xFF);
            var storeLenHigh = (byte)((qrBytes.Length + 3) >> 8);
            Raw(Gs, (byte)'(', (byte)'k', storeLenLow, storeLenHigh, 49, 80, 48);
            bytes.Write(qrBytes, 0, qrBytes.Length);
            Raw(Gs, (byte)'(', (byte)'k', 3, 0, 49, 81, 48);
            preview.Append("[ ZATCA QR CODE ]\n");
        }

        Left();

        // Feed clear of the cutter before cutting — without this, the last printed line(s) (the
        // QR/footer) can still be under the print head when the cut fires and never fully come
        // through, which is exactly what happened on the field-tested POS-80C: the receipt cut
        // right after the QR with the rest of the paper blank.
        Raw(Esc, (byte)'d', 5); // feed 5 lines
        Raw(Gs, (byte)'V', 0); // partial cut

        return new ReceiptPayload(Convert.ToBase64String(bytes.ToArray()), preview.ToString());
    }

    public static ReceiptPayload BuildTestPrint(string branchName, string deviceCode, string model)
    {
        using var bytes = new MemoryStream();
        var preview = new StringBuilder();

        void Line(string text, bool bold = false, bool center = false)
        {
            if (center) Write(bytes, [Esc, (byte)'a', 1]); else Write(bytes, [Esc, (byte)'a', 0]);
            if (bold) Write(bytes, [Esc, (byte)'E', 1]);
            WriteText(bytes, ToPrintableAscii(text) + "\n");
            if (bold) Write(bytes, [Esc, (byte)'E', 0]);
            preview.AppendLine(center ? text.PadLeft((32 + text.Length) / 2) : text);
        }

        Write(bytes, [Esc, (byte)'@']); // init
        Line(branchName, bold: true, center: true);
        Line("---- TEST PRINT ----", center: true);
        Line($"Device: {deviceCode}");
        Line($"Model:  {model}");
        Line($"Time:   {DateTime.UtcNow:yyyy-MM-dd HH:mm}");
        Line(new string('-', 32));
        Line("This confirms the printer is");
        Line("reachable and configured.");
        Write(bytes, [Esc, (byte)'d', 5]); // feed 5 lines
        Write(bytes, [0x1D, (byte)'V', 0]); // partial cut

        return new ReceiptPayload(Convert.ToBase64String(bytes.ToArray()), preview.ToString());
    }

    public static ReceiptPayload BuildLabel(string sku, string? barcode, string nameEn, decimal price)
    {
        using var bytes = new MemoryStream();
        var preview = new StringBuilder();

        void Line(string text, bool bold = false, bool center = false)
        {
            if (center) Write(bytes, [Esc, (byte)'a', 1]); else Write(bytes, [Esc, (byte)'a', 0]);
            if (bold) Write(bytes, [Esc, (byte)'E', 1]);
            WriteText(bytes, ToPrintableAscii(text) + "\n");
            if (bold) Write(bytes, [Esc, (byte)'E', 0]);
            preview.AppendLine(center ? text.PadLeft((32 + text.Length) / 2) : text);
        }

        Write(bytes, [Esc, (byte)'@']); // init
        Line(nameEn.Length > 32 ? nameEn[..32] : nameEn, bold: true, center: true);
        Line($"SKU: {sku}", center: true);
        Line($"SAR {price:F2}", bold: true, center: true);
        if (!string.IsNullOrWhiteSpace(barcode))
        {
            // GS k — print Code128 barcode (system 73 = CODE128), height 80 dots.
            Write(bytes, [Gs, (byte)'h', 80]);
            Write(bytes, [Gs, (byte)'k', 73, (byte)barcode.Length]);
            WriteText(bytes, barcode);
            preview.AppendLine($"[ BARCODE {barcode} ]");
        }
        Write(bytes, [Esc, (byte)'d', 3]); // feed 3 lines
        Write(bytes, [0x1D, (byte)'V', 0]); // partial cut

        return new ReceiptPayload(Convert.ToBase64String(bytes.ToArray()), preview.ToString());
    }

    // Generic ESC/POS thermal printers (the vast majority of cheap clone hardware, e.g. the
    // POS-80C this was field-tested against) only support a single-byte code page and have no
    // Arabic glyphs — sending raw UTF-8 multi-byte sequences for Arabic gets each byte
    // misinterpreted as an unrelated extended-ASCII character, printing garbage. Strip to ASCII
    // for the physical print; PreviewText (on-screen review, DB record) keeps the full text as
    // constructed (English-only by design for the receipt body).
    private static string ToPrintableAscii(string text)
    {
        var stripped = new string(text.Where(ch => ch < 128).ToArray());
        // Only trims the "label / " artifact left behind by stripping a trailing Arabic
        // translation (e.g. "TAX INVOICE / " -> "TAX INVOICE") — must NOT trim '-', or an
        // all-dashes divider line (new string('-', Width)) gets wiped out to nothing.
        return stripped.TrimEnd(' ', '/');
    }

    private static void Write(Stream stream, byte[] data) => stream.Write(data, 0, data.Length);
    private static void WriteText(Stream stream, string text)
    {
        var data = Encoding.UTF8.GetBytes(text);
        stream.Write(data, 0, data.Length);
    }
}
