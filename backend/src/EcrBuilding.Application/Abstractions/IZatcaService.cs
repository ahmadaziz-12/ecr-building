using EcrBuilding.Application.Zatca;

namespace EcrBuilding.Application.Abstractions;

public interface IZatcaService
{
    // Model B (per-branch CSID) — every onboarding operation is scoped to one branch's own
    // EGS identity; there is no company-wide identity anymore.
    Task<ZatcaIdentityDto> GetIdentityAsync(int branchId, CancellationToken cancellationToken = default);
    Task<ZatcaIdentityDto> GenerateCsrAsync(int branchId, CancellationToken cancellationToken = default);
    Task<ZatcaIdentityDto> GetComplianceCsidAsync(int branchId, string otp, CancellationToken cancellationToken = default);
    Task<ZatcaProductionOnboardingResultDto> RunProductionOnboardingAsync(int branchId, CancellationToken cancellationToken = default);
    Task<ZatcaIdentityDto> SetEnvironmentAsync(int branchId, string environment, CancellationToken cancellationToken = default);
    Task<ZatcaInvoiceDto?> SubmitInvoiceForOrderAsync(int orderId, CancellationToken cancellationToken = default);
}
