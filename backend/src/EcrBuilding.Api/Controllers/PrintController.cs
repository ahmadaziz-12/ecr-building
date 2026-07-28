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

        var label = EscPosBuilder.BuildLabel(product.Sku, product.Barcode, product.NameEn, product.SellingPrice);
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
public record PrintLabelRequest(int ProductId, int? TerminalId);
