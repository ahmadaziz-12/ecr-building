import type { ProductUomConversionDto } from "@/lib/api/catalog";

// BRD §2.3 UOM engine — client-side mirror of the backend's UomMath.cs. All price/quantity math the
// POS cart shows live must agree with what the server will compute at checkout, so both sides follow
// the same convention: a factor means "1 selling-UOM = factor stock-UOM" (1 Pallet = 50 Bag).

export type UomOption = { uom: string; factorToStock: number };

/** Every UOM the cashier may sell in: the stock UOM itself (factor 1) plus each configured conversion. */
export function sellableUoms(stockUom: string, conversions: ProductUomConversionDto[]): UomOption[] {
  return [
    { uom: stockUom, factorToStock: 1 },
    ...conversions
      .filter((c) => c.factorToStock > 0 && c.uom.toLowerCase() !== stockUom.toLowerCase())
      .map((c) => ({ uom: c.uom, factorToStock: c.factorToStock })),
  ];
}

/** null = this UOM isn't configured for the product — never assume 1:1 (the server will reject it too). */
export function factorToStock(sellUom: string, stockUom: string, conversions: ProductUomConversionDto[]): number | null {
  if (sellUom.toLowerCase() === stockUom.toLowerCase()) return 1;
  const match = conversions.find((c) => c.uom.toLowerCase() === sellUom.toLowerCase());
  return match && match.factorToStock > 0 ? match.factorToStock : null;
}

/** Price for one selling-UOM unit: 1 Pallet of 20-SAR bags at factor 50 → 1,000 SAR. */
export function unitPriceFor(sellingPricePerStockUom: number, factor: number): number {
  return sellingPricePerStockUom * factor;
}

/** Quantity the sale will deduct from stock, in stock UOM — what the availability check runs against. */
export function toStockQty(qty: number, factor: number): number {
  return roundAwayFromZero(qty * factor, 3);
}

/** Cut-to-size area (m²) from dimensions in metres — 3dp, matching the backend's UomMath.AreaOf. */
export function areaOf(lengthM: number, widthM: number): number {
  return roundAwayFromZero(lengthM * widthM, 3);
}

/** Cut-to-size linear length (m) — 3dp, matching the backend's UomMath.LengthOf. */
export function lengthOf(lengthM: number): number {
  return roundAwayFromZero(lengthM, 3);
}

/** Cut-to-size volume (m³) from dimensions in metres — 3dp, matching the backend's UomMath.VolumeOf. */
export function volumeOf(lengthM: number, widthM: number, heightM: number): number {
  return roundAwayFromZero(lengthM * widthM * heightM, 3);
}

// JS Math.round rounds -0.5 toward +∞ and toFixed uses banker's-ish float behavior; this matches
// .NET's MidpointRounding.AwayFromZero, which the backend uses for all quantity math.
function roundAwayFromZero(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * scale + Number.EPSILON) / scale;
}

/**
 * Parses the admin form's compact conversions field — "Pallet=50; Ton=20" (also accepts commas and
 * newlines as separators) — into structured rows. Invalid fragments are dropped rather than blocking
 * the save; the field is optional configuration, not a data-entry gauntlet.
 */
export function parseUomConversions(input: string | undefined): ProductUomConversionDto[] {
  if (!input?.trim()) return [];
  return input
    .split(/[;,\n]/)
    .map((pair) => {
      const [uom, factorRaw] = pair.split("=").map((s) => s.trim());
      const factorToStock = Number(factorRaw);
      if (!uom || !Number.isFinite(factorToStock) || factorToStock <= 0) return null;
      return { uom, factorToStock };
    })
    .filter((c): c is ProductUomConversionDto => c !== null);
}

/** Inverse of parseUomConversions — prefills the edit-product form field. */
export function formatUomConversions(conversions: ProductUomConversionDto[]): string {
  return conversions.map((c) => `${c.uom}=${c.factorToStock}`).join("; ");
}

// The Add/Edit SKU form's single "Cut-to-size" select combines the IsCutToSize flag and
// CutToSizeUnit into one choice, so picking a unit also turns the feature on — there's no separate
// toggle to forget to flip.
export function parseCutToSizeMode(mode: string | undefined): { isCutToSize: boolean; cutToSizeUnit: "Length" | "Area" | "Volume" } {
  if (mode === "Length (linear m)") return { isCutToSize: true, cutToSizeUnit: "Length" };
  if (mode === "Volume (m³)") return { isCutToSize: true, cutToSizeUnit: "Volume" };
  if (mode === "Area (m²)") return { isCutToSize: true, cutToSizeUnit: "Area" };
  return { isCutToSize: false, cutToSizeUnit: "Area" };
}

/** Inverse of parseCutToSizeMode — prefills the edit-product form field. */
export function formatCutToSizeMode(isCutToSize: boolean, cutToSizeUnit: string): string {
  if (!isCutToSize) return "Not cut-to-size";
  if (cutToSizeUnit === "Length") return "Length (linear m)";
  if (cutToSizeUnit === "Volume") return "Volume (m³)";
  return "Area (m²)";
}
