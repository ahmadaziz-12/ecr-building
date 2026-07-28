using System.Security.Claims;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Enums;
using Microsoft.AspNetCore.Mvc.Filters;

namespace EcrBuilding.Api.Authorization;

// Checks the caller's EFFECTIVE permission (role default, with any per-user "Customize
// Permissions" override merged in) for one page+action, resolved per request via IPermissionResolver
// — not a JWT claim. Deliberately not constructor-DI'd (this is a plain Attribute, instantiated by
// the runtime before DI resolves anything for it); it pulls IPermissionResolver from
// HttpContext.RequestServices instead, the standard pattern for attribute-based filters that need a
// scoped service. moduleKey is the frontend route this endpoint backs (e.g. "/stock/warehouses",
// matching AppLayout.tsx's `to` and PermissionCatalog.cs's Key) — not a coarse section bucket.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class RequireModuleAttribute(string moduleKey, PermissionAction action) : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (!user.Identity?.IsAuthenticated ?? true)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedResult();
            return;
        }

        var userIdClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdClaim, out var userId))
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedResult();
            return;
        }

        var resolver = context.HttpContext.RequestServices.GetRequiredService<IPermissionResolver>();
        var allowed = await resolver.HasAsync(userId, moduleKey, action, context.HttpContext.RequestAborted);

        if (!allowed)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(new { error = $"You don't have {action} access to {moduleKey}." })
            {
                StatusCode = 403,
            };
        }
    }
}
