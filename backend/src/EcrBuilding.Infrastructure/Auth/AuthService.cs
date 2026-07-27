using System.Security.Cryptography;
using System.Text;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace EcrBuilding.Infrastructure.Auth;

public class AuthService(
    AppDbContext db,
    IPasswordHasher passwordHasher,
    IJwtTokenService jwtTokenService,
    IAuditService auditService,
    IConfiguration configuration) : IAuthService
{
    public async Task<AuthResult> LoginAsync(string email, string password, string? ip, CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .Include(u => u.Role).ThenInclude(r => r!.Permissions)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null || !passwordHasher.Verify(password, user.PasswordHash))
        {
            await auditService.LogAsync("auth", "LOGIN_FAILED", reason: $"email={email}", severity: AuditSeverity.Warning, cancellationToken: cancellationToken);
            throw new AuthException("Invalid email or password.");
        }

        if (user.Status != UserStatus.Active)
        {
            throw new AuthException("This account is not active.");
        }

        user.LastLoginAt = DateTime.UtcNow;
        var tokens = await IssueTokensAsync(user, ip, cancellationToken);
        await auditService.LogAsync("auth", "LOGIN_SUCCESS", recordId: user.Id.ToString(), userId: user.Id, userName: user.Name, branchId: user.BranchId, cancellationToken: cancellationToken);

        return new AuthResult(await MapCurrentUserAsync(user, cancellationToken), tokens);
    }

    // BRD §10.2 (Module 15): PIN quick-login — identical issuance/audit path to password login, with
    // the PIN (set via admin reset-pin) as the credential. Kept separate so failed-PIN attempts are
    // distinguishable from failed-password attempts in the audit trail.
    public async Task<AuthResult> PinLoginAsync(string email, string pin, string? ip, CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .Include(u => u.Role).ThenInclude(r => r!.Permissions)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null || user.PinHash is null || !passwordHasher.Verify(pin, user.PinHash))
        {
            await auditService.LogAsync("auth", "PIN_LOGIN_FAILED", reason: $"email={email}", severity: AuditSeverity.Warning, cancellationToken: cancellationToken);
            throw new AuthException("Invalid email or PIN.");
        }

        if (user.Status != UserStatus.Active)
        {
            throw new AuthException("This account is not active.");
        }

        user.LastLoginAt = DateTime.UtcNow;
        var tokens = await IssueTokensAsync(user, ip, cancellationToken);
        await auditService.LogAsync("auth", "PIN_LOGIN_SUCCESS", recordId: user.Id.ToString(), userId: user.Id, userName: user.Name, branchId: user.BranchId, cancellationToken: cancellationToken);

        return new AuthResult(await MapCurrentUserAsync(user, cancellationToken), tokens);
    }

    public async Task<AuthResult> RefreshAsync(string refreshTokenValue, string? ip, CancellationToken cancellationToken = default)
    {
        var hash = Hash(refreshTokenValue);
        var existing = await db.RefreshTokens
            .Include(t => t.User).ThenInclude(u => u!.Role).ThenInclude(r => r!.Permissions)
            .Include(t => t.User).ThenInclude(u => u!.Branch)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);

        if (existing is null || !existing.IsActive || existing.User is null)
        {
            throw new AuthException("Refresh token is invalid or expired.");
        }

        // Unlike Login/PinLogin, this path never re-checked Status — a deactivated user's existing
        // refresh cookie kept silently minting fresh access+refresh tokens with full permissions
        // forever, since deactivation only blocks a NEW login, not an already-issued session's renewal.
        // Revoke the token outright (not just refuse it) so this exact cookie can never be retried.
        if (existing.User.Status != UserStatus.Active)
        {
            existing.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            await auditService.LogAsync("auth", "REFRESH_DENIED_INACTIVE", recordId: existing.User.Id.ToString(),
                userId: existing.User.Id, userName: existing.User.Name, severity: AuditSeverity.Warning, cancellationToken: cancellationToken);
            throw new AuthException("This account is not active.");
        }

        existing.RevokedAt = DateTime.UtcNow;
        var tokens = await IssueTokensAsync(existing.User, ip, cancellationToken);
        existing.ReplacedByTokenId = (await db.RefreshTokens.OrderByDescending(t => t.Id).FirstAsync(cancellationToken)).Id;
        await db.SaveChangesAsync(cancellationToken);

        return new AuthResult(await MapCurrentUserAsync(existing.User, cancellationToken), tokens);
    }

    public async Task LogoutAsync(string refreshTokenValue, CancellationToken cancellationToken = default)
    {
        var hash = Hash(refreshTokenValue);
        var existing = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (existing is not null)
        {
            existing.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<CurrentUserDto?> GetCurrentUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .Include(u => u.Role).ThenInclude(r => r!.Permissions)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        return user is null ? null : await MapCurrentUserAsync(user, cancellationToken);
    }

    public async Task<CurrentUserDto?> UpdateLocaleAsync(int userId, string locale, CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .Include(u => u.Role).ThenInclude(r => r!.Permissions)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null) return null;

        user.PreferredLocale = locale;
        await db.SaveChangesAsync(cancellationToken);
        return await MapCurrentUserAsync(user, cancellationToken);
    }

    private async Task<TokenPair> IssueTokensAsync(User user, string? ip, CancellationToken cancellationToken)
    {
        var claims = UserClaimsFactory.Build(user);

        var access = jwtTokenService.CreateAccessToken(user, claims);

        var refreshValue = jwtTokenService.CreateRefreshTokenValue();
        var refreshDays = int.Parse(configuration.GetSection("Jwt")["RefreshTokenDays"] ?? "14");
        var refreshExpiresAt = DateTime.UtcNow.AddDays(refreshDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Hash(refreshValue),
            ExpiresAt = refreshExpiresAt,
            CreatedByIp = ip,
        });
        await db.SaveChangesAsync(cancellationToken);

        return new TokenPair(access.Token, access.ExpiresAt, refreshValue, refreshExpiresAt);
    }

    private async Task<CurrentUserDto> MapCurrentUserAsync(User user, CancellationToken cancellationToken)
    {
        if (user.Role is null)
        {
            await db.Entry(user).Reference(u => u.Role).LoadAsync(cancellationToken);
        }

        var permissions = (user.Role?.Permissions ?? [])
            .Select(p => new ModulePermissionDto(p.Module.ToString(), p.Level.ToString()))
            .ToList();

        var posCeilings = new PosCeilingsDto(
            user.Role?.DiscountCeilingPercent,
            user.Role?.SurplusReturnCeilingAmount,
            user.Role?.CanAuthorizeStandardReturnWithoutReceipt ?? false,
            user.Role?.CanOverrideItemPrice ?? false,
            user.Role?.CanAuthorizeDamagedReturns ?? false,
            user.Role?.CanVoidTransactions ?? false,
            user.Role?.CanViewXReport ?? false,
            user.Role?.CanViewZReport ?? false,
            user.Role?.CanConfigureReturnRulesAndFees ?? false,
            user.Role?.CanManagePriceListAndUsers ?? false,
            user.Role?.CanManageSystemConfiguration ?? false);

        return new CurrentUserDto(
            user.Id,
            user.Name,
            user.Email,
            user.Role?.Name ?? "Unknown",
            user.Role?.ApprovalCap ?? 0,
            user.BranchId,
            user.Branch?.NameEn,
            user.PreferredLocale,
            permissions,
            posCeilings);
    }

    private static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes);
    }
}
