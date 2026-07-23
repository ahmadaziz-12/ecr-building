using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum ZatcaOnboardingStatus { NotStarted, CsrGenerated, ComplianceCsidObtained, ProductionReady }
// Matches ZATCA's own three e-invoicing gateway environments (NonProduction = the Fatoora
// developer-portal sandbox) rather than a local/offline "simulate" mode — ZatcaApiClient always
// calls the real gw-fatoora.zatca.gov.sa gateway; this only selects which of its three URL
// segments to hit.
public enum ZatcaEnvironment { NonProduction, Simulation, Production }
public enum ZatcaInvoiceType { Standard, Simplified }
public enum ZatcaInvoiceStatus { Pending, Submitted, Cleared, Failed }

// One row PER BRANCH — each branch is its own ZATCA EGS "device" with its own CSR/CSID and its
// own ICV/PIH hash chain (ZATCA's actual intended model: one CR/VAT number shared across
// branches, but each branch independently onboarded and independently chained). Concurrent
// checkouts on the SAME branch still need to serialize around this row (see ZatcaService), but
// different branches never contend with each other.
// PrivateKeyPem/ComplianceSecret/ProductionSecret are encrypted at rest via IDataProtector before
// being persisted (see ZatcaService) — despite the field name, PrivateKeyPem holds ciphertext, not
// a raw PEM string.
public class ZatcaIdentity : BaseEntity
{
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string? PrivateKeyPem { get; set; }
    public string? Csr { get; set; }
    public string EgsSerial { get; set; } = "1-ECR|2-BuildPOS|3-" + Guid.NewGuid().ToString("N")[..8];
    public string? ComplianceRequestId { get; set; }
    public string? ComplianceToken { get; set; }
    public string? ComplianceSecret { get; set; }
    public string? ProductionRequestId { get; set; }
    public string? ProductionToken { get; set; }
    public string? ProductionSecret { get; set; }
    public int LastIcv { get; set; }
    // Seeded to ZATCA's well-known base64(SHA256("")) empty-string hash per spec.
    public string LastInvoiceHash { get; set; } = "NWZlY2VmYjEwMDMwYzc1NGY4OTVhMDU0YTJhOGFmMTU=";
    public ZatcaEnvironment Environment { get; set; } = ZatcaEnvironment.NonProduction;
    public bool Phase2Enabled { get; set; }
    public ZatcaOnboardingStatus OnboardingStatus { get; set; } = ZatcaOnboardingStatus.NotStarted;
}

public class ZatcaSettings : BaseEntity
{
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string VatRegistrationNumber { get; set; } = string.Empty;
    public string SellerName { get; set; } = string.Empty;
    public string? CrNumber { get; set; }
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
    public string BuildingNumber { get; set; } = string.Empty;
}

public class ZatcaInvoice : BaseEntity
{
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public string? Uuid { get; set; }
    public ZatcaInvoiceType Type { get; set; } = ZatcaInvoiceType.Simplified;
    public DateTime IssueDate { get; set; } = DateTime.UtcNow;
    public decimal TotalAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public int Icv { get; set; }
    public string PreviousHash { get; set; } = string.Empty;
    public string InvoiceHash { get; set; } = string.Empty;
    public string? QrCodeBase64 { get; set; }
    public string? XmlContent { get; set; }
    public ZatcaInvoiceStatus Status { get; set; } = ZatcaInvoiceStatus.Pending;
    public string? ZatcaResponse { get; set; }
}

public enum PrintJobType { Receipt, Label }
public enum PrintJobStatus { Queued, Printed, Failed }

// No physical printer in this environment — "printing" renders the ESC/POS payload + a
// human-readable preview and stores it here instead of sending it to a device.
public class PrintJob
{
    public int Id { get; set; }
    public int? TerminalId { get; set; }
    public Terminal? Terminal { get; set; }
    public int? OrderId { get; set; }
    public Order? Order { get; set; }
    public PrintJobType Type { get; set; } = PrintJobType.Receipt;
    public string EscPosBase64 { get; set; } = string.Empty;
    public string PreviewText { get; set; } = string.Empty;
    public PrintJobStatus Status { get; set; } = PrintJobStatus.Printed;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Singleton row — a self-signed RSA keypair QZ Tray uses to silently trust this server (no
// per-print "Action Required" dialog on the cashier's machine) once its own allowed.dat/
// override.crt is configured to trust CertificatePem. Generated lazily on first use.
public class QzCertificate : BaseEntity
{
    public string CertificatePem { get; set; } = string.Empty;
    public string PrivateKeyPem { get; set; } = string.Empty;
}
