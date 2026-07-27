// Module 7 (BRD §4.3.2) — client-side mirror of the backend's LoyaltyRules.cs tier ladder, so the
// cart totals the cashier sees match what the server will charge. These are Settings-configurable
// (Finance > Loyalty Program > Program Settings) — every function below takes the live config as a
// parameter, falling back to the BRD's own defaults only until that config has loaded.

export type LoyaltyTierConfig = {
  silverThreshold: number; goldThreshold: number; platinumThreshold: number;
  silverMultiplier: number; goldMultiplier: number; platinumMultiplier: number;
  silverDiscountPct: number; goldDiscountPct: number; platinumDiscountPct: number;
  freeDeliveryMinOrderSar: number;
};

export const DEFAULT_TIER_CONFIG: LoyaltyTierConfig = {
  silverThreshold: 5_000, goldThreshold: 20_000, platinumThreshold: 50_000,
  silverMultiplier: 1.5, goldMultiplier: 2, platinumMultiplier: 3,
  silverDiscountPct: 5, goldDiscountPct: 10, platinumDiscountPct: 15,
  freeDeliveryMinOrderSar: 500,
};

function discountPctForTier(tier: string | undefined, config: LoyaltyTierConfig): number {
  switch (tier) {
    case "Silver": return config.silverDiscountPct;
    case "Gold": return config.goldDiscountPct;
    case "Platinum": return config.platinumDiscountPct;
    default: return 0;
  }
}

export function tierDiscountPct(tier: string | undefined, loyaltyEnrolled: boolean | undefined, config: LoyaltyTierConfig = DEFAULT_TIER_CONFIG): number {
  if (!loyaltyEnrolled || !tier) return 0;
  return discountPctForTier(tier, config);
}

export function qualifiesForFreeDelivery(
  tier: string | undefined,
  loyaltyEnrolled: boolean | undefined,
  merchandiseTotal: number,
  config: LoyaltyTierConfig = DEFAULT_TIER_CONFIG,
): boolean {
  return Boolean(loyaltyEnrolled) && discountPctForTier(tier, config) >= config.silverDiscountPct && merchandiseTotal > config.freeDeliveryMinOrderSar;
}

/** SAR spend still needed to reach the next tier — null at Platinum. */
export function nextTierProgress(
  lifetimeSpend: number,
  config: LoyaltyTierConfig = DEFAULT_TIER_CONFIG,
): { nextTier: string; threshold: number; remaining: number } | null {
  if (lifetimeSpend < config.silverThreshold) return { nextTier: "Silver", threshold: config.silverThreshold, remaining: config.silverThreshold - lifetimeSpend };
  if (lifetimeSpend < config.goldThreshold) return { nextTier: "Gold", threshold: config.goldThreshold, remaining: config.goldThreshold - lifetimeSpend };
  if (lifetimeSpend < config.platinumThreshold) return { nextTier: "Platinum", threshold: config.platinumThreshold, remaining: config.platinumThreshold - lifetimeSpend };
  return null;
}
