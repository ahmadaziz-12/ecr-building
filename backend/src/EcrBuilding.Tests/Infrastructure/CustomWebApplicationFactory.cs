using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace EcrBuilding.Tests.Infrastructure;

/// <summary>
/// Boots the real Api pipeline (real controllers, real auth, real EF model) against a private
/// in-memory SQLite database instead of the production MySQL connection, so integration tests can
/// exercise raw-SQL paths (e.g. the atomic stock-deduction UPDATE in OrdersController) that the
/// EF Core InMemory provider does not support.
///
/// Each test class should create its own factory instance (via a fresh `new CustomWebApplicationFactory()`
/// or an IClassFixture) so databases don't leak state between unrelated test classes.
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    // Kept open for the lifetime of the factory — SQLite's ":memory:" database is destroyed the
    // instant its only open connection closes, so this connection IS the database.
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // AddInfrastructure's own AddDbContext<AppDbContext>(UseMySql(...)) call registers more
            // than just a DbContextOptions<AppDbContext> descriptor — it also adds an
            // IDbContextOptionsConfiguration<AppDbContext> descriptor holding the UseMySql(...) delegate
            // itself. That descriptor type is additive (EF Core applies every registered
            // IDbContextOptionsConfiguration<T> in order when building options), so simply re-registering
            // AddDbContext with Sqlite runs BOTH configuration delegates — the MySql one still calls
            // ServerVersion.AutoDetect() and tries to open a real MySQL connection. All three descriptor
            // kinds must be removed for the swap to fully take effect.
            var descriptorsToRemove = services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                d.ServiceType == typeof(AppDbContext) ||
                (d.ServiceType.IsGenericType && d.ServiceType.GetGenericTypeDefinition() == typeof(IDbContextOptionsConfiguration<>))
            ).ToList();
            foreach (var descriptor in descriptorsToRemove)
            {
                services.Remove(descriptor);
            }

            _connection.Open();
            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));
        });
    }

    /// <summary>
    /// Creates the schema on the in-memory database. Call once per test before seeding.
    /// Uses EnsureCreatedAsync deliberately, NOT MigrateAsync/Database.Migrate(): the ~20 accumulated
    /// migrations were authored against the MySQL provider (raw column-type strings, MySQL-flavored
    /// annotations), and EF Core's model fingerprint is provider-specific — replaying those migrations
    /// against the Sqlite provider trips EF's PendingModelChangesWarning even with zero real schema
    /// drift, because the "current model" it computes under Sqlite structurally differs from the
    /// snapshot captured under MySQL. EnsureCreatedAsync sidesteps this entirely by building the
    /// schema directly from the current C# model under whichever provider is active.
    /// If a test needs DbSeeder.SeedAsync's data (which calls Database.MigrateAsync() internally),
    /// call it with applyMigrations: false — see TestDataSeeder / Module4RoleCeilingsTests for the
    /// pattern.
    /// </summary>
    public async Task InitializeDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
    }

    public AppDbContext CreateDbContext()
    {
        var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
        }
    }
}
