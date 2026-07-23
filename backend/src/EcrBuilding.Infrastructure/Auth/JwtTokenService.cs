using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace EcrBuilding.Infrastructure.Auth;

public class JwtTokenService(IConfiguration configuration) : IJwtTokenService
{
    public AccessToken CreateAccessToken(User user, IReadOnlyDictionary<string, string> claims)
    {
        var section = configuration.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(section["Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresMinutes = int.Parse(section["AccessTokenMinutes"] ?? "15");
        var expiresAt = DateTime.UtcNow.AddMinutes(expiresMinutes);

        var identityClaims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
        };
        identityClaims.AddRange(claims.Select(kv => new Claim(kv.Key, kv.Value)));

        var token = new JwtSecurityToken(
            issuer: section["Issuer"],
            audience: section["Audience"],
            claims: identityClaims,
            expires: expiresAt,
            signingCredentials: creds);

        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    public string CreateRefreshTokenValue() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
}
