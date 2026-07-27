using System.Globalization;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Infrastructure.Persistence;

// Loads the loyalty program's full configuration (earn/redeem economics + tier ladder + free
// delivery + birthday bonus + points expiry) from Settings (Category="Pos", Group="Loyalty", seeded
// by EnsureLoyaltySettingsAsync), falling back to the BRD §4.3 defaults for any key that hasn't been
// configured yet. Lives in Infrastructure (not Api.Controllers) so LoyaltyPointsExpiryService — a
// background service in this same project — can use it too, not just Api controllers. Public so it's
// visible across the assembly boundary to EcrBuilding.Api.
public static class LoyaltyConfigLoader
{
    public static async Task<LoyaltyConfig> GetLoyaltyConfigAsync(this AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Settings
            .Where(s => s.Category == "Pos" && s.Group == "Loyalty" && s.Scope == SettingScope.Global)
            .ToListAsync(ct);

        decimal Dec(string key, decimal fallback) =>
            rows.Where(r => r.Key == key).OrderByDescending(r => r.Id).FirstOrDefault() is { } row
                && decimal.TryParse(row.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var v)
                ? v : fallback;

        return new LoyaltyConfig(
            PointsPerSarEarned: Dec("PointsPerSarEarned", LoyaltyConfig.Default.PointsPerSarEarned),
            PointsPerSarRedeemed: Dec("PointsPerSarRedeemed", LoyaltyConfig.Default.PointsPerSarRedeemed),
            MinRedeemPoints: (int)Dec("MinRedeemPoints", LoyaltyConfig.Default.MinRedeemPoints),
            MaxRedeemPctOfTotal: Dec("MaxRedeemPctOfTotal", LoyaltyConfig.Default.MaxRedeemPctOfTotal),
            SilverThreshold: Dec("SilverThreshold", LoyaltyConfig.Default.SilverThreshold),
            GoldThreshold: Dec("GoldThreshold", LoyaltyConfig.Default.GoldThreshold),
            PlatinumThreshold: Dec("PlatinumThreshold", LoyaltyConfig.Default.PlatinumThreshold),
            SilverMultiplier: Dec("SilverMultiplier", LoyaltyConfig.Default.SilverMultiplier),
            GoldMultiplier: Dec("GoldMultiplier", LoyaltyConfig.Default.GoldMultiplier),
            PlatinumMultiplier: Dec("PlatinumMultiplier", LoyaltyConfig.Default.PlatinumMultiplier),
            SilverDiscountPct: Dec("SilverDiscountPct", LoyaltyConfig.Default.SilverDiscountPct),
            GoldDiscountPct: Dec("GoldDiscountPct", LoyaltyConfig.Default.GoldDiscountPct),
            PlatinumDiscountPct: Dec("PlatinumDiscountPct", LoyaltyConfig.Default.PlatinumDiscountPct),
            FreeDeliveryMinOrderSar: Dec("FreeDeliveryMinOrderSar", LoyaltyConfig.Default.FreeDeliveryMinOrderSar),
            BirthdayBonusMultiplier: Dec("BirthdayBonusMultiplier", LoyaltyConfig.Default.BirthdayBonusMultiplier),
            PointsExpiryMonths: (int)Dec("PointsExpiryMonths", LoyaltyConfig.Default.PointsExpiryMonths));
    }
}
