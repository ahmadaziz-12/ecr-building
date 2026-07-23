using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Application.Abstractions;

public record AccessToken(string Token, DateTime ExpiresAt);

public interface IJwtTokenService
{
    AccessToken CreateAccessToken(User user, IReadOnlyDictionary<string, string> claims);
    string CreateRefreshTokenValue();
}
