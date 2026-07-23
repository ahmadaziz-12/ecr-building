namespace EcrBuilding.Application.Auth;

public record LoginRequest(string Email, string Password);

public record ModulePermissionDto(string Module, string Level);

public record CurrentUserDto(
    int Id,
    string Name,
    string Email,
    string Role,
    decimal ApprovalCap,
    int? BranchId,
    string? BranchName,
    string PreferredLocale,
    IReadOnlyList<ModulePermissionDto> Permissions);

public record TokenPair(string AccessToken, DateTime AccessTokenExpiresAt, string RefreshToken, DateTime RefreshTokenExpiresAt);

public record AuthResult(CurrentUserDto User, TokenPair Tokens);

public class AuthException(string message) : Exception(message);
