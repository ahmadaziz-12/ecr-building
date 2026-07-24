using Microsoft.AspNetCore.Mvc;

namespace EcrBuilding.Api.Authorization;

public static class ControllerBaseExtensions
{
    // Branch-level users (Cashier/Manager roles tied to one location) get a `branchId` claim at
    // login; HQ roles (Owner/Admin/HR/Accountant) have none and see every branch. Callers use this
    // to scope Network list queries down to the caller's own branch when the claim is present.
    public static int? GetScopedBranchId(this ControllerBase controller)
    {
        var claim = controller.User.FindFirst("branchId")?.Value;
        return int.TryParse(claim, out var branchId) ? branchId : null;
    }
}
