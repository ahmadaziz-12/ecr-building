import type { BundleDto, BundleLineDto } from "@/lib/api/bundles";

// Phase 3 Bundle Suggestion Engine (BRD §5.5): "Bundle contains A B C D E, cashier already
// scanned A B C D → completion 4/5 (80%) → suggest." Pulled out as a pure module (matching the
// project's existing pricing.ts/uom.ts/loyalty.ts convention) so the algorithm is unit-testable
// without mounting the whole POS screen, and so PosCheckout.tsx has one place to call instead of
// an inline useMemo.

export type BundleCompletion = {
  bundle: BundleDto;
  /** 0..1 — fraction of the bundle's distinct constituent lines already satisfied in the cart. */
  pct: number;
  /** Constituent lines whose required qty isn't yet met — empty means the bundle is 100% covered. */
  missing: BundleLineDto[];
};

/** How much of `bundle` is already covered by `cartQtyFor` (the plain, non-bundle cart quantity
 *  already present for a given product id). A bundle with no lines never completes (guards
 *  against a 0/0 division reading as 100%, even though the backend never persists one). */
export function bundleCompletion(
  bundle: BundleDto,
  cartQtyFor: (productId: number) => number,
): BundleCompletion {
  const missing = bundle.lines.filter((l) => cartQtyFor(l.productId) < l.qty);
  return {
    bundle,
    pct: bundle.lines.length > 0 ? (bundle.lines.length - missing.length) / bundle.lines.length : 0,
    missing,
  };
}

/** The single best suggestion to show right now: highest-completion bundle at or above
 *  `threshold` (BRD default 80%) that isn't already in the cart as a real bundle purchase and
 *  hasn't been dismissed this sale — null if nothing qualifies. */
export function bestBundleSuggestion(
  bundles: BundleDto[],
  cartQtyFor: (productId: number) => number,
  opts: { excludeBundleIds: number[]; dismissedIds: number[]; threshold?: number },
): BundleCompletion | null {
  const threshold = opts.threshold ?? 0.8;
  const candidates = bundles
    .filter((b) => b.lines.length > 0 && !opts.excludeBundleIds.includes(b.id))
    .map((b) => bundleCompletion(b, cartQtyFor))
    .filter((c) => c.pct >= threshold && !opts.dismissedIds.includes(c.bundle.id))
    .sort((a, b) => b.pct - a.pct);
  return candidates[0] ?? null;
}
