import { describe, expect, it } from "vitest";
import { mapProducts, mapVariantGroups, type ProductDto, type ProductVariantGroupDto } from "./catalog";

function makeProduct(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 1,
    sku: "STEEL-RBR-12MM",
    barcode: null,
    nameEn: "Steel Rebar 12MM",
    nameAr: null,
    categoryId: 1,
    categoryName: "Steel",
    brand: "Hadeed",
    costPrice: 1600,
    sellingPrice: 1950,
    vatRate: 15,
    stockUom: "Bundle",
    sellUoms: [],
    weight: 500,
    returnable: true,
    reorderLevel: 10,
    reorderQty: 40,
    imageUrl: null,
    status: "Active",
    totalOnHand: 20,
    totalAvailable: 20,
    uomConversions: [],
    isCutToSize: false,
    cutToSizeUnit: "Area",
    attributes: [],
    supplierId: null,
    supplierName: null,
    binLocation: null,
    variantGroupId: null,
    variantGroupName: null,
    ...overrides,
  };
}

describe("mapProducts", () => {
  it("shows the linked variant group's name in the Variant Group column", () => {
    const table = mapProducts([makeProduct({ variantGroupId: 5, variantGroupName: "Steel Rebar" })]);
    expect(table.columns).toContain("Variant Group");
    const col = table.columns.indexOf("Variant Group");
    expect(table.rows[0][col]).toBe("Steel Rebar");
  });

  it("shows an em dash for a standalone SKU with no variant group", () => {
    const table = mapProducts([makeProduct()]);
    const col = table.columns.indexOf("Variant Group");
    expect(table.rows[0][col]).toBe("—");
  });
});

function makeGroup(overrides: Partial<ProductVariantGroupDto> = {}): ProductVariantGroupDto {
  return {
    id: 1,
    code: "STEEL-RBR",
    nameEn: "Steel Rebar",
    nameAr: null,
    categoryId: 1,
    categoryName: "Steel",
    imageUrl: null,
    status: "Active",
    variantCount: 2,
    ...overrides,
  };
}

describe("mapVariantGroups", () => {
  it("maps groups to table rows with variant counts", () => {
    const table = mapVariantGroups([makeGroup()]);
    expect(table.rows).toEqual([["STEEL-RBR", "Steel Rebar", "Steel", 2, "Active"]]);
  });

  it("flags empty groups (no SKUs linked yet) in the KPI row", () => {
    const table = mapVariantGroups([makeGroup({ variantCount: 0 })]);
    const kpi = table.kpis?.find((k) => k.label === "Empty Groups");
    expect(kpi?.value).toBe("1");
    expect(kpi?.tone).toBe("warning");
  });
});
