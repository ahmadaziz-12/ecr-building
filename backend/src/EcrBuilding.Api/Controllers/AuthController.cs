using System.Security.Claims;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

public record UpdateLocaleRequest(string Locale);
// BRD §10.2 (Module 15): PIN quick-login for POS terminals + PIN re-verification for idle unlock.
public record PinLoginRequest(string Email, string Pin);
public record VerifyPinRequest(string Pin);
// Self-service PIN set/update — the current password confirms it's really the account owner making
// the change, not whoever found an unlocked terminal.
public record SetPinRequest(string CurrentPassword, string NewPin);

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService, AppDbContext db, IPasswordHasher passwordHasher) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<CurrentUserDto>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request.Email, request.Password, HttpContext.Connection.RemoteIpAddress?.ToString(), cancellationToken);
        SetAuthCookies(result.Tokens);
        return Ok(result.User);
    }

    // BRD §10.2 (Module 15): PIN quick-login for POS terminals — same token issuance as password
    // login, gated on the user's PIN (set via Admin → Users → Reset PIN). Email+password stays the
    // back-office path; this is the fast register sign-in.
    [HttpPost("pin-login")]
    [AllowAnonymous]
    public async Task<ActionResult<CurrentUserDto>> PinLogin(PinLoginRequest request, CancellationToken cancellationToken)
    {
        var result = await authService.PinLoginAsync(request.Email, request.Pin, HttpContext.Connection.RemoteIpAddress?.ToString(), cancellationToken);
        SetAuthCookies(result.Tokens);
        return Ok(result.User);
    }

    // BRD §10.2 (Module 15): re-verifies the CURRENT user's PIN to release the idle auto-lock —
    // no new tokens are issued (the session is still valid; the screen was just locked).
    [HttpPost("verify-pin")]
    [Authorize]
    public async Task<ActionResult> VerifyPin(VerifyPinRequest request, CancellationToken cancellationToken)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync([userId], cancellationToken);
        if (user?.PinHash is null || !passwordHasher.Verify(request.Pin, user.PinHash))
        {
            return BadRequest(new { error = "Incorrect PIN." });
        }
        return Ok(new { verified = true });
    }

    // BRD §10.2: self-service PIN set/update (minimum 6 digits). Confirmed with the account password
    // so a walk-up at an unlocked screen can't silently take over someone's PIN.
    [HttpPut("me/pin")]
    [Authorize]
    public async Task<ActionResult> SetPin(SetPinRequest request, CancellationToken cancellationToken)
    {
        if (request.NewPin is null || request.NewPin.Length < 6 || !request.NewPin.All(char.IsAsciiDigit))
        {
            return BadRequest(new { error = "PIN must be at least 6 digits (numbers only)." });
        }

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync([userId], cancellationToken);
        if (user is null) return NotFound();
        if (!passwordHasher.Verify(request.CurrentPassword, user.PasswordHash))
        {
            return BadRequest(new { error = "Current password is incorrect." });
        }

        user.PinHash = passwordHasher.Hash(request.NewPin);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { message = "PIN updated. You can now use it for PIN login and unlocking the register." });
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
