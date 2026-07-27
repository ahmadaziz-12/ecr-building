import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type CategoryDto = {
  id: number; code: string; nameEn: string; nameAr: string | null; parentId: number | null; parentName: string | null;
  attributes: string[]; returnRule: string; defaultUom: string; vatRate: number; returnable: boolean; status: string; skuCount: number;
};
// BRD §2.3: "1 {uom} = {factorToStock} {stockUom}" — drives the POS cart's UOM dropdown; the backend
// refuses to sell in any UOM without a row here, so the dropdown only ever offers configured units.
export type ProductUomConversionDto = { uom: string; factorToStock: number };
// BRD §2.2: a structured custom attribute (Grade, Size, Colour, Diameter…) — the category's
// Attribute Template suggests names, this is the actual value on one product.
export type ProductAttributeDto = { name: string; value: string };
// BRD §2.3 items 5-6: which dimensions the POS asks for on a cut-to-size line.
export type CutToSizeUnit = "Length" | "Area" | "Volume";

export type ProductDto = {
  id: number; sku: string; barcode: string | null; nameEn: string; nameAr: string | null; categoryId: number; categoryName: string;
  brand: string | null; costPrice: number; sellingPrice: number; vatRate: number; stockUom: string; sellUoms: string[];
  weight: number; returnable: boolean; reorderLevel: number; reorderQty: number; imageUrl: string | null; status: string;
  totalOnHand: number; totalAvailable: number;
  uomConversions: ProductUomConversionDto[]; isCutToSize: boolean; cutToSizeUnit: CutToSizeUnit;
  attributes: ProductAttributeDto[];
};

export const useCategories = (enabled = true) => useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiGet<CategoryDto[]>("/api/catalog/categories"), enabled });
// A category name alone is ambiguous once subcategories exist — e.g. "Pipes" could be a child of
// both "Electric" and "Plumbing". Prefix with the parent so selects/lookups stay unique.
export const categoryDisplayLabel = (c: CategoryDto) => (c.parentName ? `${c.parentName} → ${c.nameEn}` : c.nameEn);
// The product form's plain "Category" + "Subcategory" dropdown pair resolves to a single leaf
// CategoryId — subcategory wins when picked, otherwise the product sits directly on the top-level
// category. Returns null only if categoryName itself doesn't match any top-level category.
export function resolveProductCategoryId(
  categories: CategoryDto[] | undefined,
  categoryName: string,
  subcategoryName?: string,
): number | null {
  const topCategory = categories?.find(
    (c) => c.parentId == null && c.nameEn.toLowerCase() === (categoryName ?? "").toLowerCase(),
  );
  if (!topCategory) return null;
  if (subcategoryName) {
    const sub = categories?.find(
      (c) => c.parentId === topCategory.id && c.nameEn.toLowerCase() === subcategoryName.toLowerCase(),
    );
    if (sub) return sub.id;
  }
  return topCategory.id;
}
// Reverse of resolveProductCategoryId — splits a product's actual CategoryId back into the
// Category/Subcategory field pair, for pre-filling the Edit SKU dialog.
export function splitProductCategory(
  categories: CategoryDto[] | undefined,
  categoryId: number,
): { category: string; subcategory: string } {
  const c = categories?.find((x) => x.id === categoryId);
  if (!c) return { category: "", subcategory: "" };
  if (c.parentId == null) return { category: c.nameEn, subcategory: "" };
  const parent = categories?.find((x) => x.id === c.parentId);
  return { category: parent?.nameEn ?? "", subcategory: c.nameEn };
}
// Category create/edit's "Belongs Under" field only ever offers top-level categories — this is
// what keeps the hierarchy exactly two levels deep (Category → Subcategory) instead of letting a
// subcategory become a parent itself. excludeId stops a category being set as its own parent.
export function resolveParentCategory(
  categories: CategoryDto[] | undefined,
  parentLabel: string,
  excludeId?: number,
): CategoryDto | undefined {
  if (!parentLabel) return undefined;
  return categories?.find(
    (c) => c.parentId == null && c.id !== excludeId && c.nameEn.toLowerCase() === parentLabel.toLowerCase(),
  );
}
// branchId scopes totalOnHand/totalAvailable to that branch's own warehouse — pass the
// cashier's branch in POS checkout so stock badges reflect what's actually there, not a
// global sum across every branch's warehouses.
export const useProducts = (enabled = true, branchId?: number) =>
  useQuery({
    queryKey: ["catalog", "products", branchId ?? "global"],
    queryFn: () => apiGet<ProductDto[]>(`/api/catalog/products${branchId ? `?branchId=${branchId}` : ""}`),
    enabled,
  });

export type CreateProductRequest = {
  sku: string; barcode: string | null; nameEn: string; nameAr: string | null; categoryId: number; brand: string | null;
  costPrice: number; sellingPrice: number; vatRate: number; stockUom: string; sellUoms: string[]; weight: number;
  returnable: boolean; reorderLevel: number; reorderQty: number; imageUrl: string | null;
  uomConversions?: ProductUomConversionDto[]; isCutToSize?: boolean; cutToSizeUnit?: CutToSizeUnit;
  attributes?: ProductAttributeDto[];
};

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProductRequest) => apiPost<ProductDto>("/api/catalog/products", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: CreateProductRequest }) => apiPut<ProductDto>(`/api/catalog/products/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

export function useSetProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<ProductDto>(`/api/catalog/products/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

export type UpsertCategoryRequest = {
  code: string; nameEn: string; nameAr: string | null; parentId: number | null; attributes: string[];
  returnRule: string; defaultUom: string; vatRate: number; returnable: boolean;
};

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertCategoryRequest) => apiPost<CategoryDto>("/api/catalog/categories", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertCategoryRequest }) => apiPut<CategoryDto>(`/api/catalog/categories/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] }),
  });
}

export function useSetCategoryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<CategoryDto>(`/api/catalog/categories/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] }),
  });
}

export function mapCategories(rows: CategoryDto[]): LiveTable {
  // Group every subcategory directly under its own top-level category, in the same relative
  // order, so the flat table reads as a simple two-level tree at a glance instead of needing a
  // separate "Parent" column the reader has to cross-reference by name.
  const topLevel = rows.filter((c) => c.parentId == null);
  const topLevelIds = new Set(topLevel.map((c) => c.id));
  const childrenOf = new Map<number, CategoryDto[]>();
  for (const c of rows) {
    if (c.parentId == null) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c);
    childrenOf.set(c.parentId, list);
  }
  // A subcategory whose parent id doesn't resolve to any known top-level row (data drift) still
  // gets listed, unindented, rather than silently disappearing from the table.
  const orphans = rows.filter((c) => c.parentId != null && !topLevelIds.has(c.parentId));
  const ordered = [...topLevel.flatMap((c) => [c, ...(childrenOf.get(c.id) ?? [])]), ...orphans];

  return {
    columns: ["Code", "Category", "SKUs", "Attributes", "Return Rule", "Default UOM", "Status"],
    statusCol: 6,
    ids: ordered.map((c) => c.id),
    rows: ordered.map((c) => [
      c.code,
      c.parentId == null ? c.nameEn : `↳ ${c.nameEn}`,
      c.skuCount,
      c.attributes.length,
      c.returnRule,
      c.defaultUom,
      c.status,
    ]),
    kpis: [
      { label: "Categories", value: String(rows.length), sub: `${rows.filter((c) => !c.parentId).length} top level`, tone: "info" },
      { label: "SKUs Assigned", value: String(rows.reduce((s, c) => s + c.skuCount, 0)), sub: "Across all categories", tone: "success" },
      { label: "Non-Returnable", value: String(rows.filter((c) => !c.returnable).length), sub: "Return rule blocked", tone: "warning" },
      { label: "Empty Categories", value: String(rows.filter((c) => c.skuCount === 0).length), sub: "No SKUs mapped", tone: rows.some((c) => c.skuCount === 0) ? "warning" : "success" },
    ],
  };
}

export function mapProducts(rows: ProductDto[]): LiveTable {
  return {
    columns: ["SKU", "Barcode", "Name EN/AR", "Category", "Brand", "Price (ر.س)", "VAT", "Stock UOM", "Selling UOMs", "Attributes", "Stock", "Status"],
    statusCol: 11,
    ids: rows.map((p) => p.id),
    rows: rows.map((p) => [
      p.sku, p.barcode ?? "—", `${p.nameEn}${p.nameAr ? ` / ${p.nameAr}` : ""}`, p.categoryName, p.brand ?? "—",
      p.sellingPrice.toFixed(2), `${p.vatRate}%`, p.stockUom, p.sellUoms.length ? p.sellUoms.join(", ") : p.stockUom,
      p.attributes.length ? p.attributes.map((a) => `${a.name}: ${a.value}`).join(", ") : "—",
      p.totalOnHand, p.returnable ? p.status : "Non-Returnable",
    ]),
    kpis: [
      { label: "Active SKUs", value: String(rows.filter((p) => p.status === "Active").length), sub: `${rows.length} total`, tone: "success" },
      { label: "Inactive SKUs", value: String(rows.filter((p) => p.status === "Inactive").length), sub: "Discontinued", tone: "muted" },
      { label: "Low Stock SKUs", value: String(rows.filter((p) => p.totalAvailable > 0 && p.totalAvailable <= p.reorderLevel).length), sub: "Reorder now", tone: "warning" },
      { label: "Missing Barcode", value: String(rows.filter((p) => !p.barcode).length), sub: "Blocks POS scan", tone: rows.some((p) => !p.barcode) ? "critical" : "success" },
    ],
  };
}
