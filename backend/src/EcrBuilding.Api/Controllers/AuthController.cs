using System.Security.Claims;
using EcrBuilding.Application.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EcrBuilding.Api.Controllers;

public record UpdateLocaleRequest(string Locale);

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<CurrentUserDto>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request.Email, request.Password, HttpContext.Connection.RemoteIpAddress?.ToString(), cancellationToken);
        SetAuthCookies(result.Tokens);
        return Ok(result.User);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<CurrentUserDto>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue("refresh_token", out var refreshToken) || string.IsNullOrEmpty(refreshToken))
        {
            return Unauthorized(new { error = "No refresh token." });
        }

        var result = await authService.RefreshAsync(refreshToken, HttpContext.Connection.RemoteIpAddress?.ToString(), cancellationToken);
        SetAuthCookies(result.Tokens);
        return Ok(result.User);
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue("refresh_token", out var refreshToken) && !string.IsNullOrEmpty(refreshToken))
        {
            await authService.LogoutAsync(refreshToken, cancellationToken);
        }

        Response.Cookies.Delete("access_token");
        Response.Cookies.Delete("refresh_token");
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<CurrentUserDto>> Me(CancellationToken cancellationToken)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await authService.GetCurrentUserAsync(userId, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    // Self-service display-language preference — deliberately not gated behind admin's
    // user-management endpoint (that requires Admin/Edit) since every user, regardless of
    // role, needs to be able to change their own UI language. Persisted on the User row
    // itself rather than any client-side storage, so it follows the user across devices/
    // sessions instead of resetting on every browser/profile.
    [HttpPut("me/locale")]
    [Authorize]
    public async Task<ActionResult<CurrentUserDto>> UpdateLocale(UpdateLocaleRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Locale) || request.Locale.Length > 10)
        {
            return BadRequest(new { error = "Invalid locale." });
        }

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await authService.UpdateLocaleAsync(userId, request.Locale, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    private void SetAuthCookies(TokenPair tokens)
    {
        var baseOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = false, // local http dev; set true behind HTTPS in production
            SameSite = SameSiteMode.Lax,
        };

        Response.Cookies.Append("access_token", tokens.AccessToken, new CookieOptions
        {
            HttpOnly = baseOptions.HttpOnly,
            Secure = baseOptions.Secure,
            SameSite = baseOptions.SameSite,
            Expires = tokens.AccessTokenExpiresAt,
        });

        Response.Cookies.Append("refresh_token", tokens.RefreshToken, new CookieOptions
        {
            HttpOnly = baseOptions.HttpOnly,
            Secure = baseOptions.Secure,
            SameSite = baseOptions.SameSite,
            Expires = tokens.RefreshTokenExpiresAt,
            Path = "/api/auth",
        });
    }
}
