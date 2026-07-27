import { describe, expect, it } from "vitest";
import { nextTierProgress, qualifiesForFreeDelivery, tierDiscountPct } from "./loyalty";

// Module 7 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — client-side mirror of LoyaltyRules.cs; the values
// asserted here match the backend Module7LoyaltyRulesTests exactly so cart totals equal charge totals.
describe("loyalty tier benefits", () => {
  it("maps each tier to its BRD discount, only when enrolled", () => {
    expect(tierDiscountPct("Bronze", true)).toBe(0);
    expect(tierDiscountPct("Silver", true)).toBe(5);
    expect(tierDiscountPct("Gold", true)).toBe(10);
    expect(tierDiscountPct("Platinum", true)).toBe(15);
    expect(tierDiscountPct("Platinum", false)).toBe(0); // not enrolled → no benefit
    expect(tierDiscountPct(undefined, true)).toBe(0);
  });

  it("free delivery needs Silver+ AND an order strictly over 500", () => {
    expect(qualifiesForFreeDelivery("Silver", true, 501)).toBe(true);
    expect(qualifiesForFreeDelivery("Silver", true, 500)).toBe(false);
    expect(qualifiesForFreeDelivery("Bronze", true, 10_000)).toBe(false);
    expect(qualifiesForFreeDelivery("Gold", false, 10_000)).toBe(false);
  });

  it("reports SAR progress to the next spend band, null at Platinum", () => {
    expect(nextTierProgress(3_000)).toEqual({ nextTier: "Silver", threshold: 5_000, remaining: 2_000 });
    expect(nextTierProgress(6_000)).toEqual({ nextTier: "Gold", threshold: 20_000, remaining: 14_000 });
    expect(nextTierProgress(45_000)).toEqual({ nextTier: "Platinum", threshold: 50_000, remaining: 5_000 });
    expect(nextTierProgress(60_000)).toBeNull();
  });
});
