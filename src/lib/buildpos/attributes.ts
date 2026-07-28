import type { ProductAttributeDto } from "@/lib/api/catalog";

// BRD §2.2: structured custom attributes (Grade, Size, Colour, Diameter…) — a category's Attribute
// Template (Categories & Attributes) suggests the names, but the actual values live per-product.
// Same compact "Name=Value; Name2=Value2" convention as uom.ts's parseUomConversions, so the two
// text fields in Add/Edit SKU read consistently.

/** Parses the admin form's compact attributes field into structured rows. Invalid/blank
 *  fragments are dropped rather than blocking the save. */
export function parseAttributes(input: string | undefined): ProductAttributeDto[] {
  if (!input?.trim()) return [];
  return input
    .split(/[;,\n]/)
    .map((pair) => {
      const [name, valueRaw] = pair.split("=").map((s) => s.trim());
      if (!name || !valueRaw) return null;
      return { name, value: valueRaw };
    })
    .filter((a): a is ProductAttributeDto => a !== null);
}

/** Inverse of parseAttributes — prefills the edit-product form field. */
export function formatAttributes(attributes: ProductAttributeDto[]): string {
  return attributes.map((a) => `${a.name}=${a.value}`).join("; ");
}
