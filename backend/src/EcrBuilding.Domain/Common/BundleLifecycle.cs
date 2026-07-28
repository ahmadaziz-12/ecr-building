using System.Text.Json;
using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Domain.Common;

/// <summary>
/// Phase 4 (BRD §5.7 Business Controls) pure helpers — bundle status/eligibility resolution shared
/// by BundlesController (CRUD/list display) and OrdersController (checkout gating), so the two can
/// never disagree about whether a bundle is actually usable right now.
/// </summary>
public static class BundleLifecycle
{
    /// <summary>"Draft"/"Pending Approval"/"Inactive"/"Archived" pass through as-is; an Active row
    /// resolves further to "Scheduled" (StartDate not yet reached), "Expired" (past EndDate), or
    /// "Active" — computed at read time, never persisted (same convention as PricingRule's
    /// ValidFrom/ValidUntil, which also never rewrites Status to "Expired").</summary>
    public static string ResolveEffectiveStatus(BundleStatus status, DateTime? startDate, DateTime? endDate, DateTime now)
    {
        if (status != BundleStatus.Active) return status switch
        {
            BundleStatus.PendingApproval => "Pending Approval",
            BundleStatus.Inactive => "Disabled",
            _ => status.ToString(),
        };
        if (startDate is not null && startDate > now) return "Scheduled";
        if (endDate is not null && endDate < now) return "Expired";
        return "Active";
    }

    public static bool IsUsableNow(BundleStatus status, DateTime? startDate, DateTime? endDate, DateTime now) =>
        ResolveEffectiveStatus(status, startDate, endDate, now) == "Active";

    /// <summary>"[]" (the default, non-null) means no restriction — every branch is eligible.</summary>
    public static bool IsBranchEligible(string eligibleBranchIdsJson, int branchId)
    {
        var ids = JsonSerializer.Deserialize<int[]>(eligibleBranchIdsJson) ?? [];
        return ids.Length == 0 || ids.Contains(branchId);
    }

    /// <summary>"[]" (the default, non-null) means no restriction — every customer type is eligible,
    /// including a walk-in sale with no customer attached at all.</summary>
    public static bool IsCustomerTypeEligible(string eligibleCustomerTypesJson, CustomerType? customerType)
    {
        var types = JsonSerializer.Deserialize<string[]>(eligibleCustomerTypesJson) ?? [];
        if (types.Length == 0) return true;
        return customerType is not null && types.Contains(customerType.Value.ToString(), StringComparer.OrdinalIgnoreCase);
    }
}
