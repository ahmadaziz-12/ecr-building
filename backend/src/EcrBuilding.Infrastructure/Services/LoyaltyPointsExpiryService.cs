using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EcrBuilding.Infrastructure.Services;

/// <summary>
/// BRD §4.3.4 (Module 20): points expire after 12 months of purchase inactivity. Runs once shortly
/// after startup and then daily; each expiry writes an Adjust ledger row so the balance history stays
/// auditable. Registered from Program.cs for every environment EXCEPT Testing (tests call
/// ExpireAsync directly instead of racing a timer).
/// </summary>
public class LoyaltyPointsExpiryService(IServiceScopeFactory scopeFactory, ILogger<LoyaltyPointsExpiryService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small startup delay so migrations/seeding finish first.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var expired = await ExpireAsync(db, DateTime.UtcNow, stoppingToken);
                if (expired > 0) logger.LogInformation("Expired loyalty points for {Count} inactive customers", expired);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Loyalty points expiry sweep failed — will retry next cycle");
            }
            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }

    /// <summary>Zeroes the balance of every enrolled customer whose last purchase is past the
    /// configured expiry window (BRD §4.3.4 default: 12 months).</summary>
    public static async Task<int> ExpireAsync(AppDbContext db, DateTime now, CancellationToken ct = default)
    {
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        var cutoff = now.AddMonths(-expiryMonths);
        var lapsed = await db.Customers
            .Where(c => c.LoyaltyEnrolled && c.LoyaltyPoints > 0 && c.LastPurchaseAt != null && c.LastPurchaseAt <= cutoff)
            .ToListAsync(ct);

        foreach (var customer in lapsed)
        {
            db.LoyaltyTransactions.Add(new LoyaltyTransaction
            {
                CustomerId = customer.Id, Type = LoyaltyTransactionType.Adjust, Points = -customer.LoyaltyPoints,
                Description = $"Points expired — no purchases in {expiryMonths} months (last: {customer.LastPurchaseAt:yyyy-MM-dd})",
            });
            customer.LoyaltyPoints = 0;
        }
        if (lapsed.Count > 0) await db.SaveChangesAsync(ct);
        return lapsed.Count;
    }
}
