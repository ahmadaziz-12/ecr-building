import { describe, expect, it } from "vitest";
import type { BundleDto, BundleLineDto } from "@/lib/api/bundles";
import { bestBundleSuggestion, bundleCompletion } from "./bundle-suggestions";

// Mirrors the BRD §5.5 worked example exactly: "Bundle contains A B C D E. Cashier already
// scanned A B C D. Completion 4/5 = 80%. Rule: if completion >= 80%, suggest bundle."
function bundleLine(productId: number, sku: string, qty = 1): BundleLineDto {
  return {
    productId,
    sku,
    productName: sku,
    qty,
    unitCost: 10,
    sellingPrice: 15,
    vatRate: 15,
    barcode: null,
  };
}

function abcdeBundle(overrides: Partial<BundleDto> = {}): BundleDto {
  return {
    id: 1,
    code: "BND-WATERPROOF",
    nameEn: "Basement Waterproof Kit",
    nameAr: null,
    bundlePrice: 100,
    componentCost: 60,
    status: "Active",
    type: "ProductSystem",
    individualTotal: 125,
    effectiveStatus: "Active",
    startDate: null,
    endDate: null,
    eligibleCustomerTypes: [],
    eligibleBranchIds: [],
    stackableDiscount: true,
    lines: [
      bundleLine(1, "A"),
      bundleLine(2, "B"),
      bundleLine(3, "C"),
      bundleLine(4, "D"),
      bundleLine(5, "E"),
    ],
    ...overrides,
  };
}

describe("bundleCompletion", () => {
  it("is 0% with an empty cart", () => {
    const result = bundleCompletion(abcdeBundle(), () => 0);
    expect(result.pct).toBe(0);
    expect(result.missing).toHaveLength(5);
  });

  it("is 80% once 4 of 5 constituents are scanned (the BRD worked example)", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 }; // A B C D, no E
    const result = bundleCompletion(abcdeBundle(), (productId) => cartQty[productId] ?? 0);
    expect(result.pct).toBeCloseTo(0.8);
    expect(result.missing.map((l) => l.sku)).toEqual(["E"]);
  });

  it("is 100% once every constituent's required qty is met", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    const result = bundleCompletion(abcdeBundle(), (productId) => cartQty[productId] ?? 0);
    expect(result.pct).toBe(1);
    expect(result.missing).toHaveLength(0);
  });

  it("treats a constituent as missing if the cart qty is under the required qty, not just absent", () => {
    // BundleLine requires 2 of B; cart only has 1.
    const bundle = abcdeBundle({ lines: [bundleLine(1, "A"), bundleLine(2, "B", 2)] });
    const result = bundleCompletion(bundle, (productId) => (productId === 1 ? 1 : 1));
    expect(result.missing.map((l) => l.sku)).toEqual(["B"]);
    expect(result.pct).toBe(0.5);
  });

  it("never reports 100% for a bundle with zero lines (defensive — backend always requires >=1)", () => {
    const result = bundleCompletion(abcdeBundle({ lines: [] }), () => 0);
    expect(result.pct).toBe(0);
  });
});

describe("bestBundleSuggestion", () => {
  it("suggests nothing below the 80% threshold", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1 }; // A B C only = 60%
    const result = bestBundleSuggestion([abcdeBundle()], (productId) => cartQty[productId] ?? 0, {
      excludeBundleIds: [],
      dismissedIds: [],
    });
    expect(result).toBeNull();
  });

  it("suggests the partial (80%+) bundle with what's missing", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 };
    const result = bestBundleSuggestion([abcdeBundle()], (productId) => cartQty[productId] ?? 0, {
      excludeBundleIds: [],
      dismissedIds: [],
    });
    expect(result?.bundle.code).toBe("BND-WATERPROOF");
    expect(result?.missing.map((l) => l.sku)).toEqual(["E"]);
  });

  it("suggests the complete (100%) bundle once the missing item is added", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    const result = bestBundleSuggestion([abcdeBundle()], (productId) => cartQty[productId] ?? 0, {
      excludeBundleIds: [],
      dismissedIds: [],
    });
    expect(result?.pct).toBe(1);
    expect(result?.missing).toHaveLength(0);
  });

  it("does not re-suggest a bundle already sitting in the cart as a real bundle purchase", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    const result = bestBundleSuggestion([abcdeBundle()], (productId) => cartQty[productId] ?? 0, {
      excludeBundleIds: [1],
      dismissedIds: [],
    });
    expect(result).toBeNull();
  });

  it("does not re-suggest a bundle the cashier dismissed this sale", () => {
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 };
    const result = bestBundleSuggestion([abcdeBundle()], (productId) => cartQty[productId] ?? 0, {
      excludeBundleIds: [],
      dismissedIds: [1],
    });
    expect(result).toBeNull();
  });

  it("picks the higher-completion bundle when two both qualify", () => {
    const bundleA = abcdeBundle({ id: 1, code: "A-KIT" });
    const bundleB = abcdeBundle({
      id: 2,
      code: "B-KIT",
      lines: [bundleLine(10, "X"), bundleLine(11, "Y")], // 2-line bundle, both scanned = 100%
    });
    const cartQty: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 10: 1, 11: 1 }; // A: 80%, B: 100%
    const result = bestBundleSuggestion(
      [bundleA, bundleB],
      (productId) => cartQty[productId] ?? 0,
      {
        excludeBundleIds: [],
        dismissedIds: [],
      },
    );
    expect(result?.bundle.code).toBe("B-KIT");
  });
});
