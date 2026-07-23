using EcrBuilding.Domain.Enums;
using Microsoft.AspNetCore.Mvc.Filters;

namespace EcrBuilding.Api.Authorization;

// Checks the `perm:{Module}` claim baked into the access token at login/refresh time
// against the minimum AccessLevel required for this endpoint.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class RequireModuleAttribute(ModuleArea module, AccessLevel minLevel) : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (!user.Identity?.IsAuthenticated ?? true)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedResult();
            return;
        }

        var claim = user.FindFirst($"perm:{module}")?.Value;
        var level = Enum.TryParse<AccessLevel>(claim, out var parsed) ? parsed : AccessLevel.None;

        if (level < minLevel)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(new { error = $"You don't have {minLevel} access to {module}." })
            {
                StatusCode = 403,
            };
        }
    }
}
