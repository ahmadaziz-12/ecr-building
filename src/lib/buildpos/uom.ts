import type { ProductUomConversionDto } from "@/lib/api/catalog";

// BRD §2.3 UOM engine — client-side mirror of the backend's UomMath.cs. All price/quantity math the
// POS cart shows live must agree with what the server will compute at checkout, so both sides follow
// the same convention: a factor means "1 selling-UOM = factor stock-UOM" (1 Pallet = 50 Bag).

export type UomOption = { uom: string; factorToStock: number };

/** Every UOM the cashier may sell in: the stock UOM itself (factor 1) plus each configured conversion. */
export function sellableUoms(
  stockUom: string,
  conversions: ProductUomConversionDto[],
): UomOption[] {
  return [
    { uom: stockUom, factorToStock: 1 },
    ...conversions
      .filter((c) => c.factorToStock > 0 && c.uom.toLowerCase() !== stockUom.toLowerCase())
      .map((c) => ({ uom: c.uom, factorToStock: c.factorToStock })),
  ];
}

/** null = this UOM isn't configured for the product — never assume 1:1 (the server will reject it too). */
export function factorToStock(
  sellUom: string,
  stockUom: string,
  conversions: ProductUomConversionDto[],
): number | null {
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
  return (Math.sign(value) * Math.round(Math.abs(value) * scale + Number.EPSILON)) / scale;
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
export function parseCutToSizeMode(mode: string | undefined): {
  isCutToSize: boolean;
  cutToSizeUnit: "Length" | "Area" | "Volume";
} {
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

// ---------------------------------------------------------------------------
// §3.1 Rounding rules / minimum quantities / selling increments
// ---------------------------------------------------------------------------

export const ROUNDING_METHODS = [
  "No Rounding",
  "Round Up",
  "Round Down",
  "Round to Nearest",
  "Full Pack Only",
  "Full Box Only",
  "Full Pallet Only",
] as const;
export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

export type UomRule = {
  /** Smallest sellable quantity in the selling UOM. */
  minQty?: number;
  /** Quantity must be a multiple of this step (0.5 boxes, 5 metres, …). */
  increment?: number;
  rounding?: RoundingMethod;
};

/**
 * Applies a product's configured rounding method, minimum quantity and selling increment to a
 * requested quantity. "Full Pack/Box/Pallet Only" all mean the same thing mathematically — whole
 * selling units — they are kept distinct so the UI can explain WHY the quantity moved.
 */
export function applyUomRule(qty: number, rule: UomRule | undefined): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  let out = qty;
  const method = rule?.rounding ?? "No Rounding";
  if (method === "Round Up") out = Math.ceil(out);
  else if (method === "Round Down") out = Math.floor(out);
  else if (method === "Round to Nearest") out = Math.round(out);
  else if (
    method === "Full Pack Only" ||
    method === "Full Box Only" ||
    method === "Full Pallet Only"
  ) {
    // Never round a full-pack product DOWN to zero — the customer asked for some of it.
    out = Math.max(1, Math.ceil(out));
  }
  const step = rule?.increment;
  if (step && step > 0) out = roundAwayFromZero(Math.ceil(out / step) * step, 3);
  const min = rule?.minQty;
  if (min && min > 0 && out < min) out = min;
  return roundAwayFromZero(out, 3);
}

/** Human explanation of an adjustment, for the POS line hint. Null when nothing changed. */
export function explainUomRule(
  requested: number,
  applied: number,
  rule: UomRule | undefined,
): string | null {
  if (applied === requested) return null;
  if (rule?.minQty && applied === rule.minQty)
    return `Minimum sellable quantity is ${rule.minQty}.`;
  if (rule?.increment) return `Sold in increments of ${rule.increment} — rounded to ${applied}.`;
  return `Rounded to ${applied} (${rule?.rounding ?? "Round to Nearest"}).`;
}

// ---------------------------------------------------------------------------
// §8 Dimension-based product engine
// ---------------------------------------------------------------------------

/** §8.1 length units → metres. Everything the engine does is metre-based internally. */
export const LENGTH_UNITS = { mm: 0.001, cm: 0.01, m: 1 } as const;
export type LengthUnit = keyof typeof LENGTH_UNITS;

/** Converts an entered measurement to metres. 2500 mm → 2.5 m. */
export function toMetres(value: number, unit: LengthUnit): number {
  return roundAwayFromZero(value * LENGTH_UNITS[unit], 6);
}

export type SheetInput = {
  length: number;
  width: number;
  unit: LengthUnit;
  panels: number;
  wastagePct?: number;
  pricePerSqm: number;
};

export type SheetResult = {
  lengthM: number;
  widthM: number;
  areaPerPanel: number;
  totalArea: number;
  chargeableArea: number;
  materialAmount: number;
};

/** §8.2 sheet/panel products: 2500×1200 mm × 4 panels @8% wastage @95/m² → 12.96 m², SAR 1,231.20. */
export function calcSheet(input: SheetInput): SheetResult {
  const lengthM = toMetres(input.length, input.unit);
  const widthM = toMetres(input.width, input.unit);
  const areaPerPanel = areaOf(lengthM, widthM);
  const panels = Math.max(0, input.panels);
  const totalArea = roundAwayFromZero(areaPerPanel * panels, 3);
  const wastage = Math.max(0, input.wastagePct ?? 0);
  const chargeableArea = roundAwayFromZero(totalArea * (1 + wastage / 100), 3);
  return {
    lengthM,
    widthM,
    areaPerPanel,
    totalArea,
    chargeableArea,
    materialAmount: roundAwayFromZero(chargeableArea * input.pricePerSqm, 2),
  };
}

export type TileResult = {
  chargeableArea: number;
  calculatedBoxes: number;
  boxes: number;
  coverageSupplied: number;
};

/** §8.3 tile coverage: 23 m² + 10% over 1.44 m²/box → 17.57 → 18 boxes covering 25.92 m². */
export function calcTileCoverage(
  requiredArea: number,
  boxCoverage: number,
  wastagePct = 0,
  fullBoxOnly = true,
): TileResult {
  const chargeableArea = roundAwayFromZero(requiredArea * (1 + Math.max(0, wastagePct) / 100), 3);
  const calculatedBoxes = boxCoverage > 0 ? roundAwayFromZero(chargeableArea / boxCoverage, 2) : 0;
  const boxes = fullBoxOnly ? Math.ceil(calculatedBoxes) : calculatedBoxes;
  return {
    chargeableArea,
    calculatedBoxes,
    boxes,
    coverageSupplied: roundAwayFromZero(boxes * boxCoverage, 3),
  };
}

/**
 * §8.4 linear products: three cable runs of 35/42/18 m deduct 95 METRES, never "3 units". Optional
 * pack/roll conversion reports how many whole rolls that consumes without changing the metre total.
 */
export function calcLinear(
  pieces: { length: number; count?: number }[],
  unit: LengthUnit = "m",
  wastagePct = 0,
  rollLengthM?: number,
): { totalLength: number; chargeableLength: number; rolls: number | null } {
  const totalLength = roundAwayFromZero(
    pieces.reduce((sum, p) => sum + toMetres(p.length, unit) * (p.count ?? 1), 0),
    3,
  );
  const chargeableLength = roundAwayFromZero(totalLength * (1 + Math.max(0, wastagePct) / 100), 3);
  return {
    totalLength,
    chargeableLength,
    rolls: rollLengthM && rollLengthM > 0 ? Math.ceil(chargeableLength / rollLengthM) : null,
  };
}
