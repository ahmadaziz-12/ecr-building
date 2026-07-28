using System.Globalization;
using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Application.Auth;

/// <summary>
/// Builds the JWT claims dictionary for a user. Single source of truth for this — AuthService uses it
/// at real login/refresh, and EcrBuilding.Tests' AuthTestHelper uses it to mint tokens for tests, so
/// the two can never drift out of sync the way they briefly did when Module 4's posCeiling claims were
/// added only to AuthService and not to the (until-then duplicated) test helper.
/// </summary>
public static class UserClaimsFactory
{
    public static Dictionary<string, string> Build(User user)
    {
        var claims = new Dictionary<string, string>
        {
            ["role"] = user.Role?.Name ?? "Unknown",
            ["approvalCap"] = (user.Role?.ApprovalCap ?? 0).ToString(CultureInfo.InvariantCulture),
        };
        if (user.BranchId is not null) claims["branchId"] = user.BranchId.Value.ToString();

        // Page permissions are deliberately NOT baked in here — RequireModuleAttribute resolves them
        // per request via IPermissionResolver instead, so a "Customize Permissions" edit takes
        // effect on the user's very next request rather than waiting for the next token refresh.

        // BRD §10.1 POS authorization ceilings (see Role.cs) — a ceiling claim is omitted entirely
        // when the underlying value is null, which callers must read as "no cap".
        if (user.Role?.DiscountCeilingPercent is { } discountCeiling)
        {
            claims["posCeiling:discountPercent"] = discountCeiling.ToString(CultureInfo.InvariantCulture);
        }
        if (user.Role?.SurplusReturnCeilingAmount is { } surplusCeiling)
        {
            claims["posCeiling:surplusReturnAmount"] = surplusCeiling.ToString(CultureInfo.InvariantCulture);
        }
        claims["posCeiling:canAuthorizeStandardReturnWithoutReceipt"] = (user.Role?.CanAuthorizeStandardReturnWithoutReceipt ?? false).ToString();
        claims["posCeiling:canOverrideItemPrice"] = (user.Role?.CanOverrideItemPrice ?? false).ToString();
        claims["posCeiling:canAuthorizeDamagedReturns"] = (user.Role?.CanAuthorizeDamagedReturns ?? false).ToString();
        claims["posCeiling:canVoidTransactions"] = (user.Role?.CanVoidTransactions ?? false).ToString();
        claims["posCeiling:canViewXReport"] = (user.Role?.CanViewXReport ?? false).ToString();
        claims["posCeiling:canViewZReport"] = (user.Role?.CanViewZReport ?? false).ToString();
        claims["posCeiling:canConfigureReturnRulesAndFees"] = (user.Role?.CanConfigureReturnRulesAndFees ?? false).ToString();
        claims["posCeiling:canManagePriceListAndUsers"] = (user.Role?.CanManagePriceListAndUsers ?? false).ToString();
        claims["posCeiling:canManageSystemConfiguration"] = (user.Role?.CanManageSystemConfiguration ?? false).ToString();

        return claims;
    }
}
