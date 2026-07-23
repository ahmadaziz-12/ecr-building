using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Zatca;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/zatca")]
[Authorize]
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
public class ZatcaController(AppDbContext db, IZatcaService zatca, IAuditService audit) : ControllerBase
{
    // One row per branch (Model B) — lets the frontend show onboarding status for every branch
    // without an N+1 round trip per branch.
    [HttpGet("identities")]
    public async Task<ActionResult<List<ZatcaIdentityDto>>> ListIdentities(CancellationToken ct)
    {
        var branchIds = await db.Branches.Select(b => b.Id).ToListAsync(ct);
        var results = new List<ZatcaIdentityDto>();
        foreach (var branchId in branchIds)
        {
            results.Add(await zatca.GetIdentityAsync(branchId, ct));
        }
        return Ok(results);
    }

    [HttpGet("identity/{branchId:int}")]
    public async Task<ActionResult<ZatcaIdentityDto>> GetIdentity(int branchId, CancellationToken ct) => Ok(await zatca.GetIdentityAsync(branchId, ct));

    [HttpPost("onboarding/{branchId:int}/csr")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaIdentityDto>> GenerateCsr(int branchId, CancellationToken ct) =>
        Ok(await zatca.GenerateCsrAsync(branchId, ct));

    [HttpPost("onboarding/{branchId:int}/compliance-csid")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaIdentityDto>> GetComplianceCsid(int branchId, ComplianceCsidRequest request, CancellationToken ct) =>
        Ok(await zatca.GetComplianceCsidAsync(branchId, request.Otp, ct));

    [HttpPost("onboarding/{branchId:int}/production-csid")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaProductionOnboardingResultDto>> RunProductionOnboarding(int branchId, CancellationToken ct) =>
        Ok(await zatca.RunProductionOnboardingAsync(branchId, ct));

    [HttpPut("identity/{branchId:int}/environment")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaIdentityDto>> SetEnvironment(int branchId, SetZatcaEnvironmentRequest request, CancellationToken ct) =>
        Ok(await zatca.SetEnvironmentAsync(branchId, request.Environment, ct));

    [HttpGet("settings")]
    public async Task<ActionResult<List<ZatcaSettingsDto>>> ListSettings(CancellationToken ct)
    {
        var rows = await db.ZatcaSettingsList.Include(s => s.Branch).OrderBy(s => s.BranchId).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPut("settings")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaSettingsDto>> UpsertSettings(UpsertZatcaSettingsRequest request, CancellationToken ct)
    {
        var settings = await db.ZatcaSettingsList.Include(s => s.Branch).FirstOrDefaultAsync(s => s.BranchId == request.BranchId, ct);
        if (settings is null)
        {
            settings = new ZatcaSettings { BranchId = request.BranchId };
            db.ZatcaSettingsList.Add(settings);
        }
        settings.VatRegistrationNumber = request.VatRegistrationNumber;
        settings.SellerName = request.SellerName;
        settings.CrNumber = request.CrNumber;
        settings.Street = request.Street;
        settings.City = request.City;
        settings.PostalCode = request.PostalCode;
        settings.BuildingNumber = request.BuildingNumber;
        await db.SaveChangesAsync(ct);
        await db.Entry(settings).Reference(s => s.Branch).LoadAsync(ct);
        await audit.LogAsync("zatca", "SETTINGS_UPDATED", request.BranchId.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(settings));
    }

    [HttpGet("invoices")]
    public async Task<ActionResult<List<ZatcaInvoiceDto>>> ListInvoices([FromQuery] int? branchId, CancellationToken ct)
    {
        var query = db.ZatcaInvoices.Include(i => i.Order).AsQueryable();
        if (branchId is not null) query = query.Where(i => i.Order != null && i.Order.BranchId == branchId);
        var rows = await query.OrderByDescending(i => i.IssueDate).ToListAsync(ct);
        return Ok(rows.Select(i => new ZatcaInvoiceDto(
            i.Id, i.OrderId, i.Order?.OrderNo ?? "", i.InvoiceNumber, i.Type.ToString(), i.IssueDate, i.TotalAmount, i.TaxAmount,
            i.Icv, i.InvoiceHash, i.QrCodeBase64, i.Status.ToString(), i.ZatcaResponse)).ToList());
    }

    [HttpPost("invoices/{orderId:int}/submit")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ZatcaInvoiceDto>> SubmitInvoice(int orderId, CancellationToken ct)
    {
        var invoice = await zatca.SubmitInvoiceForOrderAsync(orderId, ct);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    private static ZatcaSettingsDto Map(ZatcaSettings s) => new(s.BranchId, s.Branch?.NameEn ?? "", s.VatRegistrationNumber, s.SellerName, s.CrNumber, s.Street, s.City, s.PostalCode, s.BuildingNumber);
}

// Separate controller (Orders-module gate, not Finance) — any cashier needs the invoice/QR for
// the receipt they just printed, regardless of whether their role can manage ZATCA settings.
[ApiController]
[Route("api/zatca/invoices")]
[Authorize]
[RequireModule(ModuleArea.Orders, AccessLevel.View)]
public class ZatcaReceiptController(AppDbContext db) : ControllerBase
{
    [HttpGet("by-order/{orderId:int}")]
    public async Task<ActionResult<ZatcaInvoiceDto>> ByOrder(int orderId, CancellationToken ct)
    {
        var invoice = await db.ZatcaInvoices.Include(i => i.Order).Where(i => i.OrderId == orderId).OrderByDescending(i => i.Id).FirstOrDefaultAsync(ct);
        return invoice is null ? NotFound() : Ok(new ZatcaInvoiceDto(
            invoice.Id, invoice.OrderId, invoice.Order?.OrderNo ?? "", invoice.InvoiceNumber, invoice.Type.ToString(), invoice.IssueDate,
            invoice.TotalAmount, invoice.TaxAmount, invoice.Icv, invoice.InvoiceHash, invoice.QrCodeBase64, invoice.Status.ToString(), invoice.ZatcaResponse));
    }
}
