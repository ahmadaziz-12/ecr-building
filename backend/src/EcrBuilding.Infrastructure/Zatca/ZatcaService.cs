using System.Text;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Zatca;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EcrBuilding.Infrastructure.Zatca;

// Orchestrates CSR generation -> compliance CSID -> compliance tests -> production CSID ->
// invoice submission against ZATCA's real e-invoicing gateway (ported from the baqala-bright-flow
// reference project). Model B: each branch is its own EGS "device" with its own CSR/CSID and its
// own independent ICV/PIH hash chain — there is no company-wide identity. The VAT/CR number is the
// only thing shared across branches, carried via each branch's own ZatcaSettings row.
public class ZatcaService(
    AppDbContext db,
    IZatcaCsrService csrService,
    IZatcaApiClient apiClient,
    IDataProtectionProvider dataProtectionProvider,
    IAuditService audit,
    ILogger<ZatcaService> logger) : IZatcaService
{
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector("EcrBuilding.Zatca.Secrets.v1");
    private readonly ZatcaInvoiceXmlBuilder _xmlBuilder = new();
    private readonly ZatcaInvoiceSigner _signer = new();

    public async Task<ZatcaIdentityDto> GetIdentityAsync(int branchId, CancellationToken cancellationToken = default)
    {
        var identity = await GetOrCreateIdentityAsync(branchId, cancellationToken);
        return Map(identity);
    }

    public async Task<ZatcaIdentityDto> GenerateCsrAsync(int branchId, CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.FindAsync([branchId], cancellationToken)
            ?? throw new InvalidOperationException($"Branch {branchId} not found.");
        var settings = await GetOrCreateBranchSettingsAsync(branchId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.VatRegistrationNumber))
        {
            throw new InvalidOperationException("Save this branch's VAT registration number under Company Billing before generating a CSR.");
        }

        var identity = await GetOrCreateIdentityAsync(branchId, cancellationToken);

        var config = new ZatcaCsrConfig(
            Environment: MapCsrEnvironment(identity.Environment),
            // Per ZATCA's Developer Portal Manual (§5.3.1): the CSR's Organization Identifier must
            // be the VAT registration number (15 digits, starting and ending with 3) — not the CR
            // number, which is a different, unrelated identifier used elsewhere on the invoice.
            OrganizationIdentifier: settings.VatRegistrationNumber,
            OrganizationUnitName: branch.NameEn,
            OrganizationName: settings.SellerName is { Length: > 0 } ? settings.SellerName : branch.NameEn,
            CountryName: "SA",
            InvoiceType: "1100", // supports both standard + simplified
            LocationAddress: branch.City is { Length: > 0 } ? branch.City : "Riyadh",
            IndustryBusinessCategory: "Retail Trade",
            SolutionName: "EcrBuilding",
            Model: "EGS");

        var result = csrService.GenerateCsr(config);

        identity.Csr = result.CsrBase64;
        identity.PrivateKeyPem = _protector.Protect(result.PrivateKeyRaw);
        identity.EgsSerial = result.EgsSerial;
        identity.OnboardingStatus = Domain.Entities.ZatcaOnboardingStatus.CsrGenerated;
        await db.SaveChangesAsync(cancellationToken);
        await audit.LogAsync("zatca", "CSR_GENERATED", branchId: branchId, cancellationToken: cancellationToken);
        return Map(identity, branch);
    }

    public async Task<ZatcaIdentityDto> GetComplianceCsidAsync(int branchId, string otp, CancellationToken cancellationToken = default)
    {
        var identity = await GetOrCreateIdentityAsync(branchId, cancellationToken);
        if (identity.Csr is null)
        {
            throw new InvalidOperationException("Generate a CSR before requesting a compliance CSID.");
        }

        var result = await apiClient.GetComplianceCsidAsync(MapApiEnvironment(identity.Environment), identity.Csr, otp);
        if (!result.Success)
        {
            logger.LogWarning("ZATCA compliance CSID request failed: {Body}", result.RawBody);
            throw new InvalidOperationException(ExtractErrorMessage(result) ?? "ZATCA rejected the compliance CSID request.");
        }

        var root = result.Body.RootElement;
        var requestId = root.TryGetProperty("requestID", out var reqIdEl) ? reqIdEl.ToString() : null;
        var binarySecurityToken = root.TryGetProperty("binarySecurityToken", out var tokenEl) ? tokenEl.GetString() : null;
        var secret = root.TryGetProperty("secret", out var secretEl) ? secretEl.GetString() : null;

        if (binarySecurityToken is null || secret is null)
        {
            throw new InvalidOperationException("ZATCA response missing binarySecurityToken/secret.");
        }

        identity.ComplianceRequestId = requestId;
        identity.ComplianceToken = binarySecurityToken;
        identity.ComplianceSecret = _protector.Protect(secret);
        identity.OnboardingStatus = Domain.Entities.ZatcaOnboardingStatus.ComplianceCsidObtained;
        await db.SaveChangesAsync(cancellationToken);
        await audit.LogAsync("zatca", "COMPLIANCE_CSID_OBTAINED", branchId: branchId, cancellationToken: cancellationToken);
        return Map(identity);
    }

    // ZATCA requires these 6 fixed document types for compliance testing before it will issue a
    // production CSID.
    private static readonly (string Prefix, string TypeCode, string Description, string? InstructionNote)[] ComplianceDocumentTypes =
    [
        ("STDSI", "388", "Standard Invoice", null),
        ("STDCN", "381", "Standard Credit Note", "InstructionNotes for Standard CreditNote"),
        ("STDDN", "383", "Standard Debit Note", "InstructionNotes for Standard DebitNote"),
        ("SIMSI", "388", "Simplified Invoice", null),
        ("SIMCN", "381", "Simplified Credit Note", "InstructionNotes for Simplified CreditNote"),
        ("SIMDN", "383", "Simplified Debit Note", "InstructionNotes for Simplified DebitNote"),
    ];

    public async Task<ZatcaProductionOnboardingResultDto> RunProductionOnboardingAsync(int branchId, CancellationToken cancellationToken = default)
    {
        var identity = await GetOrCreateIdentityAsync(branchId, cancellationToken);
        if (identity.ComplianceToken is null || identity.ComplianceSecret is null)
        {
            throw new InvalidOperationException("Obtain a compliance CSID before production onboarding.");
        }

        var ccsidSecret = _protector.Unprotect(identity.ComplianceSecret);
        var privateKey = _protector.Unprotect(identity.PrivateKeyPem!);
        var environment = MapApiEnvironment(identity.Environment);

        var icv = 0;
        var pih = identity.LastInvoiceHash;
        var outcomes = new List<ZatcaComplianceTestDto>();

        foreach (var (prefix, typeCode, description, instructionNote) in ComplianceDocumentTypes)
        {
            icv++;
            var isSimplified = prefix.StartsWith("SIM", StringComparison.Ordinal);
            var subtype = isSimplified ? "0200000" : "0100000";

            var doc = _xmlBuilder.ModifyForComplianceTest($"{prefix}-0001", subtype, typeCode, icv, pih, instructionNote);
            var signed = _signer.Sign(doc, DecodeCertificateContent(identity.ComplianceToken), privateKey);

            var response = await apiClient.ComplianceChecksAsync(environment, identity.ComplianceToken, ccsidSecret, signed);
            var (passed, apiStatus, alreadyCompliant) = EvaluateComplianceResponse(response, isSimplified);

            outcomes.Add(new ZatcaComplianceTestDto(description, apiStatus ?? "UNKNOWN", passed));
            if (passed && !alreadyCompliant)
            {
                pih = signed.InvoiceHash;
            }

            await Task.Delay(200, cancellationToken);
        }

        var allPassed = outcomes.All(o => o.Passed);
        if (!allPassed)
        {
            return new ZatcaProductionOnboardingResultDto(Map(identity), outcomes);
        }

        var prodResult = await apiClient.GetProductionCsidAsync(environment, identity.ComplianceToken, ccsidSecret, identity.ComplianceRequestId ?? "");
        if (!prodResult.Success)
        {
            throw new InvalidOperationException(ExtractErrorMessage(prodResult) ?? "ZATCA rejected the production CSID request.");
        }

        var root = prodResult.Body.RootElement;
        var requestId = root.TryGetProperty("requestID", out var reqIdEl) ? reqIdEl.ToString() : null;
        var binarySecurityToken = root.TryGetProperty("binarySecurityToken", out var tokenEl) ? tokenEl.GetString() : null;
        var secret = root.TryGetProperty("secret", out var secretEl) ? secretEl.GetString() : null;

        if (binarySecurityToken is null || secret is null)
        {
            throw new InvalidOperationException("ZATCA response missing binarySecurityToken/secret.");
        }

        identity.ProductionRequestId = requestId;
        identity.ProductionToken = binarySecurityToken;
        identity.ProductionSecret = _protector.Protect(secret);
        // Production CSID is a new device/credential — start a fresh hash chain for this branch.
        identity.LastIcv = 0;
        identity.LastInvoiceHash = "NWZlY2VmYjEwMDMwYzc1NGY4OTVhMDU0YTJhOGFmMTU=";
        identity.OnboardingStatus = Domain.Entities.ZatcaOnboardingStatus.ProductionReady;
        identity.Phase2Enabled = true;
        await db.SaveChangesAsync(cancellationToken);
        await audit.LogAsync("zatca", "PRODUCTION_READY", branchId: branchId, cancellationToken: cancellationToken);
        return new ZatcaProductionOnboardingResultDto(Map(identity), outcomes);
    }

    public async Task<ZatcaIdentityDto> SetEnvironmentAsync(int branchId, string environment, CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<Domain.Entities.ZatcaEnvironment>(environment, ignoreCase: true, out var parsed))
        {
            throw new InvalidOperationException($"Unknown ZATCA environment \"{environment}\".");
        }

        var identity = await GetOrCreateIdentityAsync(branchId, cancellationToken);
        identity.Environment = parsed;
        await db.SaveChangesAsync(cancellationToken);
        await audit.LogAsync("zatca", "ENVIRONMENT_CHANGED", branchId: branchId, newValue: parsed.ToString(), cancellationToken: cancellationToken);
        return Map(identity);
    }

    public async Task<ZatcaInvoiceDto?> SubmitInvoiceForOrderAsync(int orderId, CancellationToken cancellationToken = default)
    {
        var order = await db.Orders.Include(o => o.Branch).Include(o => o.Customer).Include(o => o.Lines).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);
        if (order is null) return null;

        // Two concurrent checkouts on the SAME branch must not fork its ICV/PIH chain — row-lock
        // this branch's identity for the duration of the external ZATCA call. Different branches
        // never contend with each other since each has its own row (Model B).
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        var identity = await db.ZatcaIdentities
            .FromSqlInterpolated($"SELECT * FROM ZatcaIdentities WHERE BranchId = {order.BranchId} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken)
            ?? await GetOrCreateIdentityAsync(order.BranchId, cancellationToken);

        if (identity.ProductionToken is null || identity.ProductionSecret is null)
        {
            throw new InvalidOperationException("Not onboarded to ZATCA production yet — complete onboarding for this branch on the ZATCA Phase 2 Settings page first.");
        }

        var settings = await db.ZatcaSettingsList.FirstOrDefaultAsync(s => s.BranchId == order.BranchId, cancellationToken);
        var sellerName = settings?.SellerName is { Length: > 0 } ? settings!.SellerName : order.Branch?.NameEn ?? "ECR Building";
        var vatNumber = settings?.VatRegistrationNumber is { Length: > 0 } ? settings!.VatRegistrationNumber : order.Branch?.VatRegistrationNumber ?? "300000000000003";

        var pcsidSecret = _protector.Unprotect(identity.ProductionSecret);
        var privateKey = _protector.Unprotect(identity.PrivateKeyPem!);
        var environment = MapApiEnvironment(identity.Environment);

        var invoiceNumber = $"INV-{DateTime.UtcNow:yyyy}-{order.Id:D6}";
        var uuid = Guid.NewGuid().ToString();
        var icv = identity.LastIcv + 1;
        var pih = identity.LastInvoiceHash;

        // Derived from the order's own (correctly computed) aggregate totals rather than trusting
        // per-line VatRate — this system applies one uniform VAT rate to the whole cart, so a
        // single rate derived from the real totals and applied to every line is both correct and
        // simpler than re-deriving it per line.
        var lineTotalsSum = order.Lines.Sum(l => l.LineTotal);
        var contractorDiscount = order.SubTotal - lineTotalsSum;
        var orderLevelDiscount = order.DiscountTotal - contractorDiscount;
        var taxableAmount = lineTotalsSum - orderLevelDiscount;
        var vatPercent = taxableAmount != 0 ? Math.Round(order.VatTotal / taxableAmount * 100, 2) : 15m;

        var items = order.Lines.Select(l =>
            new ZatcaInvoiceLineItem(l.Product?.NameEn ?? "Item", l.Qty, l.Qty != 0 ? l.LineTotal / l.Qty : l.UnitPrice, vatPercent)
        ).ToList();

        // Module 11 (BRD §6.3): a B2B/Contractor customer WITH a captured VAT registration number gets
        // a STANDARD tax invoice (subtype 0100000, clearance model, buyer party on the XML); everyone
        // else stays on the simplified (B2C) reporting path exactly as before.
        var isB2b = order.Customer is { VatNo.Length: > 0 }
            && order.Customer.Type is CustomerType.Contractor or CustomerType.B2B;

        var data = new ZatcaInvoiceData(
            Id: invoiceNumber,
            Uuid: uuid,
            IssueDate: order.CreatedAt.ToString("yyyy-MM-dd"),
            IssueTime: order.CreatedAt.ToString("HH:mm:ss"),
            InvoiceTypeCode: "388",
            Subtype: isB2b ? "0100000" : "0200000",
            Icv: icv,
            Pih: pih,
            Supplier: new ZatcaParty(
                RegistrationName: sellerName,
                VatId: vatNumber,
                Address: new ZatcaPartyAddress(settings?.Street, settings?.BuildingNumber, settings?.City, order.Branch?.City, settings?.PostalCode),
                PartyIdentificationSchemeId: settings?.CrNumber is { Length: > 0 } ? "CRN" : null,
                PartyIdentificationId: settings?.CrNumber is { Length: > 0 } ? settings.CrNumber : null),
            Customer: isB2b
                ? new ZatcaParty(
                    RegistrationName: order.Customer!.NameEn,
                    VatId: order.Customer.VatNo!,
                    Address: new ZatcaPartyAddress(order.Customer.Address, null, order.Customer.City, order.Customer.District, null))
                : null,
            Items: items,
            DiscountAmount: orderLevelDiscount);

        var invoiceDoc = _xmlBuilder.Build(data);
        var signed = _signer.Sign(invoiceDoc, DecodeCertificateContent(identity.ProductionToken), privateKey);

        // Standard (B2B) invoices go through CLEARANCE; simplified (B2C) invoices go through REPORTING.
        var response = isB2b
            ? await apiClient.InvoiceClearanceAsync(environment, identity.ProductionToken, pcsidSecret, signed)
            : await apiClient.InvoiceReportingAsync(environment, identity.ProductionToken, pcsidSecret, signed);
        var statusProperty = isB2b ? "clearanceStatus" : "reportingStatus";
        var status = response.Body.RootElement.TryGetProperty(statusProperty, out var statusEl) ? statusEl.GetString() ?? "" : "";
        var isAccepted = status.Contains(isB2b ? "CLEARED" : "REPORTED", StringComparison.Ordinal);

        var invoice = new ZatcaInvoice
        {
            OrderId = order.Id, InvoiceNumber = invoiceNumber, Uuid = uuid,
            Type = isB2b ? Domain.Entities.ZatcaInvoiceType.Standard : Domain.Entities.ZatcaInvoiceType.Simplified,
            IssueDate = order.CreatedAt, TotalAmount = order.GrandTotal, TaxAmount = order.VatTotal,
            Icv = icv, PreviousHash = pih, InvoiceHash = signed.InvoiceHash, QrCodeBase64 = signed.QrCode, XmlContent = signed.Invoice,
            Status = isAccepted ? Domain.Entities.ZatcaInvoiceStatus.Cleared : Domain.Entities.ZatcaInvoiceStatus.Failed,
            ZatcaResponse = response.RawBody,
        };
        db.ZatcaInvoices.Add(invoice);

        // Only advance this branch's ICV/PIH chain on acceptance — a rejected invoice must not
        // break the chain for the next successful one.
        if (isAccepted)
        {
            identity.LastIcv = icv;
            identity.LastInvoiceHash = signed.InvoiceHash;
        }
        else
        {
            logger.LogWarning("ZATCA invoice for order {OrderId} (branch {BranchId}) was rejected: {Body}", orderId, order.BranchId, response.RawBody);
        }

        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        await audit.LogAsync("zatca", isAccepted ? "INVOICE_CLEARED" : "INVOICE_REJECTED", invoice.Id.ToString(), branchId: order.BranchId, newValue: invoiceNumber, cancellationToken: cancellationToken);
        return Map(invoice, order.OrderNo);
    }

    private async Task<ZatcaSettings> GetOrCreateBranchSettingsAsync(int branchId, CancellationToken ct)
    {
        var settings = await db.ZatcaSettingsList.FirstOrDefaultAsync(s => s.BranchId == branchId, ct);
        if (settings is not null) return settings;

        settings = new ZatcaSettings { BranchId = branchId };
        db.ZatcaSettingsList.Add(settings);
        await db.SaveChangesAsync(ct);
        return settings;
    }

    private async Task<ZatcaIdentity> GetOrCreateIdentityAsync(int branchId, CancellationToken ct)
    {
        var identity = await db.ZatcaIdentities.Include(i => i.Branch).FirstOrDefaultAsync(i => i.BranchId == branchId, ct);
        if (identity is null)
        {
            var branch = await db.Branches.FindAsync([branchId], ct)
                ?? throw new InvalidOperationException($"Branch {branchId} not found.");
            identity = new ZatcaIdentity { BranchId = branchId, Branch = branch };
            db.ZatcaIdentities.Add(identity);
            await db.SaveChangesAsync(ct);
        }
        return identity;
    }

    // ZATCA's binarySecurityToken is double base64-encoded. The raw value (as returned by the
    // CSID APIs) is correct as-is for Basic Auth, but ZatcaInvoiceSigner expects the certificate
    // content pre-decoded once — down to the certificate's PEM body text, not the raw DER.
    private static string DecodeCertificateContent(string binarySecurityToken) =>
        Encoding.UTF8.GetString(Convert.FromBase64String(binarySecurityToken));

    private static string MapCsrEnvironment(Domain.Entities.ZatcaEnvironment environment) => environment switch
    {
        Domain.Entities.ZatcaEnvironment.Production => "Production",
        Domain.Entities.ZatcaEnvironment.Simulation => "Simulation",
        _ => "NonProduction",
    };

    private static string MapApiEnvironment(Domain.Entities.ZatcaEnvironment environment) => environment switch
    {
        Domain.Entities.ZatcaEnvironment.Production => "production",
        Domain.Entities.ZatcaEnvironment.Simulation => "simulation",
        _ => "sandbox",
    };

    private static (bool Passed, string? ApiStatus, bool AlreadyCompliant) EvaluateComplianceResponse(ZatcaApiResult response, bool isSimplified)
    {
        var root = response.Body.RootElement;
        var statusField = isSimplified ? "reportingStatus" : "clearanceStatus";
        var status = root.TryGetProperty(statusField, out var statusEl) ? statusEl.GetString() ?? "UNKNOWN" : "UNKNOWN";

        var alreadyCompliant = false;
        if (root.TryGetProperty("validationResults", out var validationResults) &&
            validationResults.TryGetProperty("errorMessages", out var errorMessages) &&
            errorMessages.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            alreadyCompliant = errorMessages.EnumerateArray()
                .Any(e => e.TryGetProperty("message", out var msg) && (msg.GetString() ?? "").Contains("Compliance check already completed", StringComparison.Ordinal));
        }

        var passed = alreadyCompliant || status.Contains("REPORTED", StringComparison.Ordinal) || status.Contains("CLEARED", StringComparison.Ordinal);
        return (passed, status, alreadyCompliant);
    }

    private static string? ExtractErrorMessage(ZatcaApiResult result)
    {
        if (result.Body.RootElement.TryGetProperty("message", out var msg)) return msg.GetString();
        if (result.Body.RootElement.ValueKind is System.Text.Json.JsonValueKind.Object && result.Body.RootElement.EnumerateObject().Any())
            return result.Body.RootElement.ToString();
        // ZATCA sometimes returns a plain-text (non-JSON) error body, e.g. "Invalid Request" —
        // fall back to it instead of swallowing the diagnostic into an empty "{}".
        return string.IsNullOrWhiteSpace(result.RawBody) ? null : result.RawBody;
    }

    private static ZatcaIdentityDto Map(ZatcaIdentity i, Branch? branch = null) => new(
        i.BranchId, (branch ?? i.Branch)?.NameEn ?? "", i.EgsSerial, i.Environment.ToString(), i.Phase2Enabled, i.OnboardingStatus.ToString(), i.LastIcv,
        i.Csr is not null, i.ComplianceToken is not null, i.ProductionToken is not null, i.Csr);

    private static ZatcaInvoiceDto Map(ZatcaInvoice inv, string orderNo) => new(
        inv.Id, inv.OrderId, orderNo, inv.InvoiceNumber, inv.Type.ToString(), inv.IssueDate, inv.TotalAmount, inv.TaxAmount,
        inv.Icv, inv.InvoiceHash, inv.QrCodeBase64, inv.Status.ToString(), inv.ZatcaResponse);
}
