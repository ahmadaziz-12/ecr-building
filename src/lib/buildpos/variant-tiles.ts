// Product Variants: collapses every SKU sharing a VariantGroupId into one browsable POS tile —
// a search/category match on ANY sibling should surface the whole family, so grouping always
// looks up siblings from the FULL product list, not just the filtered `shown` set. Standalone
// products (no group) pass through unchanged, in their original relative order.
export type TileSourceProduct = {
  sku: string;
  name: string;
  categoryId: number;
  uom: string;
  price: number;
  imageUrl?: string | null;
  variantGroupId?: number | null;
  variantGroupName?: string | null;
};

export type GroupTile<T> = {
  isGroup: true;
  variantGroupId: number;
  name: string;
  categoryId: number;
  uom: string;
  imageUrl: string | null;
  minPrice: number;
  variants: T[];
};

export type ProductTile<T> = (T & { isGroup?: false }) | GroupTile<T>;

export function groupProductTiles<T extends TileSourceProduct>(
  shown: T[],
  allProducts: T[],
): ProductTile<T>[] {
  const seenGroups = new Set<number>();
  const result: ProductTile<T>[] = [];
  for (const p of shown) {
    if (p.variantGroupId == null) {
      result.push(p);
      continue;
    }
    if (seenGroups.has(p.variantGroupId)) continue;
    seenGroups.add(p.variantGroupId);
    const variants = allProducts.filter((v) => v.variantGroupId === p.variantGroupId);
    result.push({
      isGroup: true,
      variantGroupId: p.variantGroupId,
      name: p.variantGroupName ?? p.name,
      categoryId: p.categoryId,
      uom: p.uom,
      imageUrl: variants.find((v) => v.imageUrl)?.imageUrl ?? null,
      minPrice: Math.min(...variants.map((v) => v.price)),
      variants,
    });
  }
  return result;
}
