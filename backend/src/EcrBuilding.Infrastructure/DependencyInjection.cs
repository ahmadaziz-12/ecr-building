using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Payments;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Infrastructure.Services;
using EcrBuilding.Infrastructure.Zatca;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EcrBuilding.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:Default");

        services.AddDbContext<AppDbContext>(options =>
            options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IStockMovementService, StockMovementService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPaymentGateway, MockPaymentGateway>();
        services.AddScoped<IGlPostingService, GlPostingService>();
        services.AddScoped<IZatcaService, ZatcaService>();

        // ZATCA private key / CSID secrets are encrypted at rest with this key ring, persisted
        // into AppDbContext (survives redeploys, unlike the default file-based ring).
        services.AddDataProtection()
            .SetApplicationName("EcrBuilding")
            .PersistKeysToDbContext<AppDbContext>();
        services.AddHttpClient<IZatcaApiClient, ZatcaApiClient>();
        services.AddScoped<IZatcaCsrService, ZatcaCsrService>();

        return services;
    }
}
