namespace EcrBuilding.Application.Zatca;

// Model B (per-branch CSID): one identity row per branch, each its own EGS device with its own
// CSR/CSID and its own ICV/PIH chain. BranchId/BranchName identify which branch this is.
public record ZatcaIdentityDto(int BranchId, string BranchName, string EgsSerial, string Environment, bool Phase2Enabled, string OnboardingStatus, int LastIcv, bool HasCsr, bool HasComplianceCsid, bool HasProductionCsid, string? Csr);
public record ZatcaSettingsDto(int BranchId, string BranchName, string VatRegistrationNumber, string SellerName, string? CrNumber, string Street, string City, string PostalCode, string BuildingNumber);
public record UpsertZatcaSettingsRequest(int BranchId, string VatRegistrationNumber, string SellerName, string? CrNumber, string Street, string City, string PostalCode, string BuildingNumber);
public record ComplianceCsidRequest(string Otp);
public record SetZatcaEnvironmentRequest(string Environment);
public record ZatcaComplianceTestDto(string DocumentType, string ZatcaStatus, bool Passed);
public record ZatcaProductionOnboardingResultDto(ZatcaIdentityDto Identity, List<ZatcaComplianceTestDto> ComplianceTests);

public record ZatcaInvoiceDto(int Id, int OrderId, string OrderNo, string InvoiceNumber, string Type, DateTime IssueDate, decimal TotalAmount, decimal TaxAmount, int Icv, string InvoiceHash, string? QrCodeBase64, string Status, string? ZatcaResponse);

public record PrintJobDto(int Id, int? TerminalId, int? OrderId, string Type, string PreviewText, string EscPosBase64, string Status, DateTime CreatedAt);
public record PrintReceiptRequest(int OrderId, int? TerminalId);
