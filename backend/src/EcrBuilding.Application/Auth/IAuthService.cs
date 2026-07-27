namespace EcrBuilding.Application.Auth;

public interface IAuthService
{
    Task<AuthResult> LoginAsync(string email, string password, string? ip, CancellationToken cancellationToken = default);
    // BRD §10.2 (Module 15): PIN quick-login for POS terminals — same token issuance, PIN credential.
    Task<AuthResult> PinLoginAsync(string email, string pin, string? ip, CancellationToken cancellationToken = default);
    Task<AuthResult> RefreshAsync(string refreshTokenValue, string? ip, CancellationToken cancellationToken = default);
    Task LogoutAsync(string refreshTokenValue, CancellationToken cancellationToken = default);
    Task<CurrentUserDto?> GetCurrentUserAsync(int userId, CancellationToken cancellationToken = default);
    Task<CurrentUserDto?> UpdateLocaleAsync(int userId, string locale, CancellationToken cancellationToken = default);
}
