import { describe, expect, it } from "vitest";
import { posCeilingsFromTier, posTierFromCeilings, POS_TIER_PRESETS } from "./admin";

// Module 4 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — the role-editing flow's "POS Authorization Tier"
// select is the only new frontend logic this module adds beyond passing values through; these tests
// cover that mapping in both directions.
describe("POS tier ceiling presets", () => {
  it("maps each BRD tier name to its documented ceiling values", () => {
    expect(posCeilingsFromTier("Cashier")).toMatchObject({ discountCeilingPercent: 5, surplusReturnCeilingAmount: 500 });
    expect(posCeilingsFromTier("Senior Cashier")).toMatchObject({ discountCeilingPercent: 10, surplusReturnCeilingAmount: 1_000, canOverrideItemPrice: true });
    expect(posCeilingsFromTier("Supervisor")).toMatchObject({ discountCeilingPercent: 15, surplusReturnCeilingAmount: null, canAuthorizeDamagedReturns: true, canVoidTransactions: true });
    expect(posCeilingsFromTier("Store Manager")).toMatchObject({ discountCeilingPercent: null, canViewZReport: true, canManagePriceListAndUsers: true });
    expect(posCeilingsFromTier("System Admin")).toMatchObject({ canManageSystemConfiguration: true });
  });

  it("falls back to no authorization for an unknown or missing tier", () => {
    expect(posCeilingsFromTier(undefined).canVoidTransactions).toBe(false);
    expect(posCeilingsFromTier("Not A Real Tier").discountCeilingPercent).toBe(0);
  });

  it("reverse-maps a role's stored ceilings back to the matching tier name for the edit form", () => {
    for (const tier of Object.keys(POS_TIER_PRESETS)) {
      expect(posTierFromCeilings(POS_TIER_PRESETS[tier])).toBe(tier);
    }
  });
});
