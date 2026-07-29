import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type CategoryDto = {
  id: number;
  code: string;
  nameEn: string;
  nameAr: string | null;
  parentId: number | null;
  parentName: string | null;
  returnable: boolean;
  status: string;
  skuCount: number;
};
// BRD §2.3: "1 {uom} = {factorToStock} {stockUom}" — drives the POS cart's UOM dropdown; the backend
// refuses to sell in any UOM without a row here, so the dropdown only ever offers configured units.
export type ProductUomConversionDto = { uom: string; factorToStock: number };
// BRD §2.2: a structured custom attribute (Grade, Size, Colour, Diameter…) on one product.
export type ProductAttributeDto = { name: string; value: string };
// BRD §2.3 items 5-6: which dimensions the POS asks for on a cut-to-size line.
export type CutToSizeUnit = "Length" | "Area" | "Volume";

export type ProductDto = {
  id: number;
  sku: string;
  barcode: string | null;
  nameEn: string;
  nameAr: string | null;
  categoryId: number;
  categoryName: string;
  brand: string | null;
  costPrice: number;
  sellingPrice: number;
  vatRate: number;
  stockUom: string;
  sellUoms: string[];
  weight: number;
  returnable: boolean;
  reorderLevel: number;
  reorderQty: number;
  imageUrl: string | null;
  status: string;
  totalOnHand: number;
  totalAvailable: number;
  uomConversions: ProductUomConversionDto[];
  isCutToSize: boolean;
  cutToSizeUnit: CutToSizeUnit;
  attributes: ProductAttributeDto[];
  supplierId: number | null;
  supplierName: string | null;
  binLocation: string | null;
  // BRD §7 (CR-038): distinct list prices for Contractor/Wholesale/Project — null = not configured,
  // checkout falls back to sellingPrice (the Retail price) for that segment.
  contractorPrice?: number | null;
  wholesalePrice?: number | null;
  projectPrice?: number | null;
  // BRD §2.3 enhancement: minimum billable qty (stock UOM) for a cut-to-size line — null = no minimum.
  minCutQty?: number | null;
  // Product Variants: optional family link (e.g. Steel Rebar groups the 12MM/16MM SKUs) — null for
  // standalone SKUs. Every variant still keeps its own price/stock/barcode/attributes.
  variantGroupId?: number | null;
  variantGroupName?: string | null;
  // Weighing Scale integration: qty comes from a live scale reading at checkout instead of manual/
  // cut-to-size entry — mutually exclusive with isCutToSize in the POS UI.
  isSoldByWeight?: boolean;
  // Serial Number Tracking: checkout requires one registered serial number per unit sold instead of
  // just decrementing a quantity — see src/lib/api/serials.ts.
  requiresSerialTracking?: boolean;
};

// A family of independent Product SKUs (own price/stock/barcode) sharing a display grouping in
// POS/catalog — e.g. "Steel Rebar" grouping the 12MM/16MM SKUs.
export type ProductVariantGroupDto = {
  id: number;
  code: string;
  nameEn: string;
  nameAr: string | null;
  categoryId: number | null;
  categoryName: string | null;
  imageUrl: string | null;
  status: string;
  variantCount: number;
};

export const useCategories = (enabled = true) =>
  useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => apiGet<CategoryDto[]>("/api/catalog/categories"),
    enabled,
  });
// A category name alone is ambiguous once subcategories exist — e.g. "Pipes" could be a child of
// both "Electric" and "Plumbing". Prefix with the parent so selects/lookups stay unique.
export const categoryDisplayLabel = (c: CategoryDto) =>
  c.parentName ? `${c.parentName} → ${c.nameEn}` : c.nameEn;
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
      (c) =>
        c.parentId === topCategory.id && c.nameEn.toLowerCase() === subcategoryName.toLowerCase(),
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
    (c) =>
      c.parentId == null &&
      c.id !== excludeId &&
      c.nameEn.toLowerCase() === parentLabel.toLowerCase(),
  );
}
// branchId scopes totalOnHand/totalAvailable to that branch's own warehouse — pass the
// cashier's branch in POS checkout so stock badges reflect what's actually there, not a
// global sum across every branch's warehouses.
// refetchIntervalMs is opt-in (undefined = no polling, the prior behavior) — only screens that need
// live stock while the user is actively working against it (POS checkout) should pay for the poll.
export const useProducts = (enabled = true, branchId?: number, refetchIntervalMs?: number) =>
  useQuery({
    queryKey: ["catalog", "products", branchId ?? "global"],
    queryFn: () =>
      apiGet<ProductDto[]>(`/api/catalog/products${branchId ? `?branchId=${branchId}` : ""}`),
    enabled,
    refetchInterval: refetchIntervalMs,
  });

export type CreateProductRequest = {
  sku: string;
  barcode: string | null;
  nameEn: string;
  nameAr: string | null;
  categoryId: number;
  brand: string | null;
  costPrice: number;
  sellingPrice: number;
  vatRate: number;
  stockUom: string;
  sellUoms: string[];
  weight: number;
  returnable: boolean;
  reorderLevel: number;
  reorderQty: number;
  imageUrl: string | null;
  uomConversions?: ProductUomConversionDto[];
  isCutToSize?: boolean;
  cutToSizeUnit?: CutToSizeUnit;
  attributes?: ProductAttributeDto[];
  contractorPrice?: number | null;
  wholesalePrice?: number | null;
  projectPrice?: number | null;
  minCutQty?: number | null;
  variantGroupId?: number | null;
  isSoldByWeight?: boolean;
  requiresSerialTracking?: boolean;
};

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProductRequest) =>
      apiPost<ProductDto>("/api/catalog/products", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

// One-screen "Add Product with Variants" wizard: creates a brand-new ProductVariantGroup AND every
// one of its variant SKUs in a single call. Value is the only thing typed per row (e.g. "12MM") —
// attributeName (e.g. "Diameter") is picked once and reused for every generated SKU's attribute.
// SKU codes and the group Code are generated server-side, never typed by the user.
export type CreateProductFamilyLine = { value: string; costPrice: number; sellingPrice: number };
export type CreateProductFamilyRequest = {
  nameEn: string;
  nameAr: string | null;
  categoryId: number;
  brand: string | null;
  imageUrl: string | null;
  stockUom: string;
  vatRate: number;
  attributeName: string;
  variants: CreateProductFamilyLine[];
};
export type ProductFamilyDto = { group: ProductVariantGroupDto; products: ProductDto[] };

export function useCreateProductFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProductFamilyRequest) =>
      apiPost<ProductFamilyDto>("/api/catalog/products/family", request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "variant-groups"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: CreateProductRequest }) =>
      apiPut<ProductDto>(`/api/catalog/products/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

export function useSetProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) =>
      apiPut<ProductDto>(`/api/catalog/products/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
  });
}

export const useVariantGroups = (enabled = true) =>
  useQuery({
    queryKey: ["catalog", "variant-groups"],
    queryFn: () => apiGet<ProductVariantGroupDto[]>("/api/catalog/variant-groups"),
    enabled,
  });

// Powers the POS variant picker: every SKU currently linked to this group, with the same
// branch-scoped stock a plain product tile shows.
export const useVariantGroupProducts = (groupId: number | null, branchId?: number, enabled = true) =>
  useQuery({
    queryKey: ["catalog", "variant-groups", groupId, "products", branchId ?? "global"],
    queryFn: () =>
      apiGet<ProductDto[]>(
        `/api/catalog/variant-groups/${groupId}/products${branchId ? `?branchId=${branchId}` : ""}`,
      ),
    enabled: enabled && groupId != null,
  });

export type UpsertProductVariantGroupRequest = {
  code: string;
  nameEn: string;
  nameAr: string | null;
  categoryId: number | null;
  imageUrl: string | null;
};

export function useCreateVariantGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertProductVariantGroupRequest) =>
      apiPost<ProductVariantGroupDto>("/api/catalog/variant-groups", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "variant-groups"] }),
  });
}

export function useUpdateVariantGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertProductVariantGroupRequest }) =>
      apiPut<ProductVariantGroupDto>(`/api/catalog/variant-groups/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "variant-groups"] }),
  });
}

export function useSetVariantGroupStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) =>
      apiPut<ProductVariantGroupDto>(`/api/catalog/variant-groups/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "variant-groups"] }),
  });
}

export function mapVariantGroups(rows: ProductVariantGroupDto[]): LiveTable {
  return {
    columns: ["Code", "Name EN/AR", "Category", "Variants", "Status"],
    statusCol: 4,
    ids: rows.map((g) => g.id),
    rows: rows.map((g) => [
      g.code,
      `${g.nameEn}${g.nameAr ? ` / ${g.nameAr}` : ""}`,
      g.categoryName ?? "—",
      g.variantCount,
      g.status,
    ]),
    kpis: [
      {
        label: "Variant Groups",
        value: String(rows.length),
        sub: `${rows.reduce((s, g) => s + g.variantCount, 0)} SKUs grouped`,
        tone: "info",
      },
      {
        label: "Empty Groups",
        value: String(rows.filter((g) => g.variantCount === 0).length),
        sub: "No SKUs linked yet",
        tone: rows.some((g) => g.variantCount === 0) ? "warning" : "success",
      },
    ],
  };
}

export type UpsertCategoryRequest = {
  code: string;
  nameEn: string;
  nameAr: string | null;
  parentId: number | null;
  returnable: boolean;
};

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertCategoryRequest) =>
      apiPost<CategoryDto>("/api/catalog/categories", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertCategoryRequest }) =>
      apiPut<CategoryDto>(`/api/catalog/categories/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] }),
  });
}

export function useSetCategoryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) =>
      apiPut<CategoryDto>(`/api/catalog/categories/${id}/status`, { status }),
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
  const nonReturnableCodes = new Set(rows.filter((c) => !c.returnable).map((c) => c.code));

  return {
    columns: ["Code", "Category", "SKUs", "Status"],
    statusCol: 3,
    ids: ordered.map((c) => c.id),
    rows: ordered.map((c) => [
      c.code,
      c.parentId == null ? c.nameEn : `↳ ${c.nameEn}`,
      c.skuCount,
      c.status,
    ]),
    kpis: [
      {
        label: "Categories",
        value: String(rows.length),
        sub: `${rows.filter((c) => !c.parentId).length} top level`,
        tone: "info",
      },
      {
        label: "SKUs Assigned",
        value: String(rows.reduce((s, c) => s + c.skuCount, 0)),
        sub: "Across all categories",
        tone: "success",
        // Row shape: [Code, Category, SKUs, Attributes, Return Rule, Default UOM, Status].
        filter: (row) => Number(row[2]) > 0,
      },
      {
        label: "Non-Returnable",
        value: String(rows.filter((c) => !c.returnable).length),
        sub: "Whole category blocked",
        tone: "warning",
        // Matched by code rather than by the displayed Return Rule text — `returnable` is the flag
        // the count is taken from, and the rule column is free-form copy that can say anything.
        filter: (row) => nonReturnableCodes.has(String(row[0])),
      },
      {
        label: "Empty Categories",
        value: String(rows.filter((c) => c.skuCount === 0).length),
        sub: "No SKUs mapped",
        tone: rows.some((c) => c.skuCount === 0) ? "warning" : "success",
        filter: (row) => Number(row[2]) === 0,
      },
    ],
  };
}

export function mapProducts(rows: ProductDto[]): LiveTable {
  // Low stock is a comparison between two fields that never reach the table (totalAvailable vs
  // reorderLevel), so the card's filter matches on the SKU column against the set it counted.
  const lowStockSkus = new Set(
    rows
      .filter((p) => p.totalAvailable > 0 && p.totalAvailable <= p.reorderLevel)
      .map((p) => p.sku),
  );
  // The Status column shows "Non-Returnable" in place of the lifecycle status for non-returnable
  // products, so an Active/Inactive card can't match on that column — match the SKU instead, or a
  // non-returnable Active SKU would be counted by the card and then filtered out of its own list.
  const activeSkus = new Set(rows.filter((p) => p.status === "Active").map((p) => p.sku));
  const inactiveSkus = new Set(rows.filter((p) => p.status === "Inactive").map((p) => p.sku));
  return {
    columns: [
      "SKU",
      "Barcode",
      "Name EN/AR",
      "Category",
      "Brand",
      "Price (ر.س)",
      "VAT",
      "Stock UOM",
      "Selling UOMs",
      "Attributes",
      "Variant Group",
      "Stock",
      "Status",
    ],
    statusCol: 12,
    ids: rows.map((p) => p.id),
    rows: rows.map((p) => [
      p.sku,
      p.barcode ?? "—",
      `${p.nameEn}${p.nameAr ? ` / ${p.nameAr}` : ""}`,
      p.categoryName,
      p.brand ?? "—",
      p.sellingPrice.toFixed(2),
      `${p.vatRate}%`,
      p.stockUom,
      p.sellUoms.length ? p.sellUoms.join(", ") : p.stockUom,
      p.attributes.length ? p.attributes.map((a) => `${a.name}: ${a.value}`).join(", ") : "—",
      p.variantGroupName ?? "—",
      p.totalOnHand,
      p.returnable ? p.status : "Non-Returnable",
    ]),
    kpis: [
      // Row shape: [SKU, Barcode, Name, Category, Brand, Price, VAT, Stock UOM, Selling UOMs,
      // Attributes, Stock, Status].
      {
        label: "Active SKUs",
        value: String(activeSkus.size),
        sub: `${rows.length} total`,
        tone: "success",
        filter: (row) => activeSkus.has(String(row[0])),
      },
      {
        label: "Inactive SKUs",
        value: String(inactiveSkus.size),
        sub: "Discontinued",
        tone: "muted",
        filter: (row) => inactiveSkus.has(String(row[0])),
      },
      {
        label: "Low Stock SKUs",
        value: String(lowStockSkus.size),
        sub: "Reorder now",
        tone: "warning",
        filter: (row) => lowStockSkus.has(String(row[0])),
      },
      {
        label: "Missing Barcode",
        value: String(rows.filter((p) => !p.barcode).length),
        sub: "Blocks POS scan",
        tone: rows.some((p) => !p.barcode) ? "critical" : "success",
        filter: (row) => String(row[1]) === "—",
      },
    ],
  };
}
