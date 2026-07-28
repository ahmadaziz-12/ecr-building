using EcrBuilding.Application.Admin;

namespace EcrBuilding.Application.Auth;

public record LoginRequest(string Email, string Password);

// Module is a page route key (e.g. "/stock/warehouses") — mirrors ModulePermissionEntry, this is
// the user's EFFECTIVE grid (role default merged with any per-user override) sent to the frontend.
public record ModulePermissionDto(string Module, bool CanView, bool CanCreate, bool CanEdit, bool CanDelete, bool CanApprove, bool CanExport);

public record CurrentUserDto(
    int Id,
    string Name,
    string Email,
    string Role,
    decimal ApprovalCap,
    int? BranchId,
    string? BranchName,
    string PreferredLocale,
    IReadOnlyList<ModulePermissionDto> Permissions,
    PosCeilingsDto PosCeilings);

public record TokenPair(string AccessToken, DateTime AccessTokenExpiresAt, string RefreshToken, DateTime RefreshTokenExpiresAt);

public record AuthResult(CurrentUserDto User, TokenPair Tokens);

public class AuthException(string message) : Exception(message);
