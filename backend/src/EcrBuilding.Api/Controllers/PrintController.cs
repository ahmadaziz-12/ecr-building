using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Zatca;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Infrastructure.Printing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/print")]
[Authorize]
[RequireModule("/operate/pos-checkout", PermissionAction.View)]
public class PrintController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet("jobs")]
    public async Task<ActionResult<List<PrintJobDto>>> List(CancellationToken ct)
    {
        var rows = await db.PrintJobs.OrderByDescending(j => j.CreatedAt).Take(100).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost("receipt")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Edit)]
    public async Task<ActionResult<PrintJobDto>> PrintReceipt(PrintReceiptRequest request, CancellationToken ct)
    {
        var order = await db.Orders.Include(o => o.Branch).Include(o => o.Customer).Include(o => o.Payments).Include(o => o.Fees)
            .Include(o => o.Lines).ThenInclude(l => l.Product).FirstOrDefaultAsync(o => o.Id == request.OrderId, ct);
        if (order is null) return NotFound();

        var invoice = await db.ZatcaInvoices.Where(i => i.OrderId == order.Id).OrderByDescending(i => i.Id).FirstOrDefaultAsync(ct);
        var vatRegistrationNumber = await db.ZatcaSettingsList.Where(s => s.BranchId == order.BranchId).Select(s => s.VatRegistrationNumber).FirstOrDefaultAsync(ct);
        var receipt = EscPosBuilder.BuildReceipt(order, order.Branch?.NameEn ?? "ECR Building", vatRegistrationNumber, invoice?.QrCodeBase64);

        var job = new PrintJob
        {
            TerminalId = request.TerminalId, OrderId = order.Id, Type = PrintJobType.Receipt,
            EscPosBase64 = receipt.EscPosBase64, PreviewText = receipt.PreviewText, Status = PrintJobStatus.Printed,
        };
        db.PrintJobs.Add(job);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", "RECEIPT_PRINTED", job.Id.ToString(), cancellationToken: ct);
        return Ok(Map(job));
    }

    [HttpPost("label")]
    [RequireModule("/stock/inventory", PermissionAction.Edit)]
    public async Task<ActionResult<PrintJobDto>> PrintLabel(PrintLabelRequest request, CancellationToken ct)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId, ct);
        if (product is null) return NotFound();

        var label = EscPosBuilder.BuildLabel(ParseTemplate(request.Template), product.Sku, product.Barcode, product.NameEn, product.SellingPrice, product.VatRate, request.OverridePrice, request.ExtraFeedLines ?? 4);
        var job = new PrintJob
        {
            TerminalId = request.TerminalId, Type = PrintJobType.Label,
            EscPosBase64 = label.EscPosBase64, PreviewText = label.PreviewText, Status = PrintJobStatus.Printed,
        };
        db.PrintJobs.Add(job);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "LABEL_PRINTED", product.Id.ToString(), cancellationToken: ct);
        return Ok(Map(job));
    }

    // Bulk shelf-restock / re-labeling: prints N copies of each selected product's label as ONE
    // combined print job per product (copies concatenated into a single ESC/POS byte stream, each
    // with its own partial-cut) so a single QZ send lays down the whole run back-to-back instead of
    // requiring one network round-trip per copy.
    [HttpPost("labels/batch")]
    [RequireModule("/stock/inventory", PermissionAction.Edit)]
    public async Task<ActionResult<List<PrintJobDto>>> PrintLabelsBatch(BatchLabelPrintRequest request, CancellationToken ct)
    {
        if (request.Items.Count == 0) return BadRequest(new { error = "Select at least one product to print." });

        var template = ParseTemplate(request.Template);
        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await db.Products.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);

        var jobs = new List<PrintJob>();
        foreach (var item in request.Items)
        {
            if (!products.TryGetValue(item.ProductId, out var product)) continue;
            var copies = Math.Clamp(item.Copies, 1, 200);

            using var combined = new MemoryStream();
            string? firstPreview = null;
            for (var i = 0; i < copies; i++)
            {
                var label = EscPosBuilder.BuildLabel(template, product.Sku, product.Barcode, product.NameEn, product.SellingPrice, product.VatRate, item.OverridePrice, request.ExtraFeedLines ?? 4);
                firstPreview ??= label.PreviewText;
                var labelBytes = Convert.FromBase64String(label.EscPosBase64);
                combined.Write(labelBytes, 0, labelBytes.Length);
            }

            var job = new PrintJob
            {
                TerminalId = request.TerminalId, Type = PrintJobType.Label,
                EscPosBase64 = Convert.ToBase64String(combined.ToArray()),
                PreviewText = $"{copies}x {product.NameEn}\n{firstPreview}",
                Status = PrintJobStatus.Printed,
            };
            db.PrintJobs.Add(job);
            jobs.Add(job);
        }

        if (jobs.Count == 0) return BadRequest(new { error = "None of the selected products could be found." });

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("inventory", "LABELS_BATCH_PRINTED", string.Join(",", productIds), cancellationToken: ct);
        return Ok(jobs.Select(Map).ToList());
    }

    private static LabelTemplate ParseTemplate(string? template) =>
        Enum.TryParse<LabelTemplate>(template, ignoreCase: true, out var parsed) ? parsed : LabelTemplate.Barcode;

    [HttpPost("test")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Edit)]
    public async Task<ActionResult<PrintJobDto>> TestPrint([FromBody] TestPrintRequest request, CancellationToken ct)
    {
        var device = await db.Devices.Include(d => d.Terminal).ThenInclude(t => t!.Branch).FirstOrDefaultAsync(d => d.Id == request.DeviceId, ct);
        if (device is null) return NotFound();
        if (device.Type != Domain.Enums.DeviceType.ReceiptPrinter) return BadRequest(new { error = "Selected device is not a receipt printer." });

        var test = EscPosBuilder.BuildTestPrint(device.Terminal?.Branch?.NameEn ?? "ECR Building", device.DeviceCode, device.Model);

        var job = new PrintJob
        {
            TerminalId = device.TerminalId, Type = PrintJobType.Receipt,
            EscPosBase64 = test.EscPosBase64, PreviewText = test.PreviewText, Status = PrintJobStatus.Printed,
        };
        db.PrintJobs.Add(job);
        device.LastTestAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "DEVICE_TEST_PRINT", device.Id.ToString(), deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(job));
    }

    private static PrintJobDto Map(PrintJob j) => new(j.Id, j.TerminalId, j.OrderId, j.Type.ToString(), j.PreviewText, j.EscPosBase64, j.Status.ToString(), j.CreatedAt);
}

public record TestPrintRequest(int DeviceId);
// OverridePrice: prints this price instead of the product's stored SellingPrice — a Label-only,
// per-print cosmetic override (e.g. a temporary markdown) that never touches the product record.
// ExtraFeedLines: how far to feed past the content before the cutter fires — a physical constant of
// the specific printer (print-head-to-cutter distance) that can't be known here, so it's a value the
// user tunes themselves in the print dialog (see EscPosBuilder.BuildLabel's doc comment).
public record PrintLabelRequest(int ProductId, int? TerminalId, string? Template = null, decimal? OverridePrice = null, int? ExtraFeedLines = null);
public record BatchLabelItem(int ProductId, int Copies, decimal? OverridePrice = null);
public record BatchLabelPrintRequest(List<BatchLabelItem> Items, int? TerminalId, string? Template = null, int? ExtraFeedLines = null);
