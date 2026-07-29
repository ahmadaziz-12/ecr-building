import { describe, expect, it } from "vitest";
import { groupProductTiles, type TileSourceProduct } from "./variant-tiles";

type TestProduct = TileSourceProduct & { stock: number };

const rebar12: TestProduct = {
  sku: "STEEL-RBR-12MM",
  name: "Steel Rebar 12MM",
  categoryId: 1,
  uom: "Bundle",
  price: 1950,
  imageUrl: null,
  variantGroupId: 10,
  variantGroupName: "Steel Rebar",
  stock: 20,
};
const rebar16: TestProduct = {
  sku: "STEEL-RBR-16MM",
  name: "Steel Rebar 16MM",
  categoryId: 1,
  uom: "Bundle",
  price: 2680,
  imageUrl: "https://example.com/rebar16.png",
  variantGroupId: 10,
  variantGroupName: "Steel Rebar",
  stock: 8,
};
const cement: TestProduct = {
  sku: "CEM-OPC-50KG",
  name: "OPC Cement 50KG",
  categoryId: 2,
  uom: "Bag",
  price: 22.5,
  imageUrl: null,
  variantGroupId: null,
  variantGroupName: null,
  stock: 100,
};

describe("groupProductTiles", () => {
  it("passes standalone (ungrouped) products through unchanged, in order", () => {
    const tiles = groupProductTiles([cement], [cement]);
    expect(tiles).toEqual([cement]);
  });

  it("collapses every SKU sharing a VariantGroupId into one tile", () => {
    const tiles = groupProductTiles([rebar12, rebar16, cement], [rebar12, rebar16, cement]);
    expect(tiles).toHaveLength(2);
    const group = tiles.find((t) => "isGroup" in t && t.isGroup);
    expect(group).toBeDefined();
    if (!group || !("isGroup" in group) || !group.isGroup) throw new Error("expected a group tile");
    expect(group.variantGroupId).toBe(10);
    expect(group.name).toBe("Steel Rebar");
    expect(group.variants).toEqual([rebar12, rebar16]);
    expect(tiles).toContainEqual(cement);
  });

  it("computes minPrice across all variants, not just the cheapest match in `shown`", () => {
    // Only the pricier 16MM variant matched the current search text — the group tile must still
    // report the true minimum across BOTH siblings, pulled from the full product list.
    const tiles = groupProductTiles([rebar16], [rebar12, rebar16]);
    const group = tiles[0];
    if (!("isGroup" in group) || !group.isGroup) throw new Error("expected a group tile");
    expect(group.minPrice).toBe(1950);
    expect(group.variants).toEqual([rebar12, rebar16]);
  });

  it("only emits one tile per group even if multiple of its variants matched", () => {
    const tiles = groupProductTiles([rebar12, rebar16], [rebar12, rebar16]);
    expect(tiles).toHaveLength(1);
  });

  it("picks the first variant with an image for the group tile's photo", () => {
    const tiles = groupProductTiles([rebar12, rebar16], [rebar12, rebar16]);
    const group = tiles[0];
    if (!("isGroup" in group) || !group.isGroup) throw new Error("expected a group tile");
    expect(group.imageUrl).toBe("https://example.com/rebar16.png");
  });

  it("falls back to the group tile's own name/category/uom from whichever variant matched", () => {
    const tiles = groupProductTiles([rebar12], [rebar12, rebar16]);
    const group = tiles[0];
    if (!("isGroup" in group) || !group.isGroup) throw new Error("expected a group tile");
    expect(group.categoryId).toBe(1);
    expect(group.uom).toBe("Bundle");
  });
});
