using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Domain.Entities;
using Microsoft.Extensions.DependencyInjection;

namespace EcrBuilding.Tests.Infrastructure;

/// <summary>
/// Mints a real access token via the production IJwtTokenService (same code path AuthService uses at
/// login) and attaches it the same way the real frontend does — as the "access_token" cookie — so
/// tests exercise the actual JwtBearer + RequireModuleAttribute authorization pipeline rather than a
/// fake test-only auth scheme. Claims come from UserClaimsFactory (the same one AuthService uses) —
/// do not hand-roll a second claims dictionary here, or it will silently drift out of sync with
/// production whenever a new claim is added there (this happened once already with Module 4's
/// posCeiling claims).
/// </summary>
public static class AuthTestHelper
{
    // Raw token only — used wherever a test needs the "access_token" cookie value itself rather than
    // an HttpClient carrying it (e.g. a SignalR HubConnection's Headers, which isn't cookie-jar based).
    public static string MintAccessToken(this CustomWebApplicationFactory factory, User user)
    {
        using var scope = factory.Services.CreateScope();
        var jwtTokenService = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var claims = UserClaimsFactory.Build(user);
        return jwtTokenService.CreateAccessToken(user, claims).Token;
    }

    public static HttpClient CreateAuthenticatedClient(this CustomWebApplicationFactory factory, User user)
    {
        var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
        });

        var token = factory.MintAccessToken(user);
        client.DefaultRequestHeaders.Add("Cookie", $"access_token={token}");
        return client;
    }
}
