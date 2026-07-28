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
  attributes: string[];
  returnRule: string;
  defaultUom: string;
  vatRate: number;
  returnable: boolean;
  status: string;
  skuCount: number;
};
// BRD §2.3: "1 {uom} = {factorToStock} {stockUom}" — drives the POS cart's UOM dropdown; the backend
// refuses to sell in any UOM without a row here, so the dropdown only ever offers configured units.
export type ProductUomConversionDto = { uom: string; factorToStock: number };

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
  supplierId: number | null;
  supplierName: string | null;
  binLocation: string | null;
};

export const useCategories = (enabled = true) =>
  useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => apiGet<CategoryDto[]>("/api/catalog/categories"),
    enabled,
  });
// branchId scopes totalOnHand/totalAvailable to that branch's own warehouse — pass the
// cashier's branch in POS checkout so stock badges reflect what's actually there, not a
// global sum across every branch's warehouses.
export const useProducts = (enabled = true, branchId?: number) =>
  useQuery({
    queryKey: ["catalog", "products", branchId ?? "global"],
    queryFn: () =>
      apiGet<ProductDto[]>(`/api/catalog/products${branchId ? `?branchId=${branchId}` : ""}`),
    enabled,
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
};

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProductRequest) =>
      apiPost<ProductDto>("/api/catalog/products", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "products"] }),
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

export type UpsertCategoryRequest = {
  code: string;
  nameEn: string;
  nameAr: string | null;
  parentId: number | null;
  attributes: string[];
  returnRule: string;
  defaultUom: string;
  vatRate: number;
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
  return {
    columns: [
      "Code",
      "Category",
      "Parent",
      "SKUs",
      "Attributes",
      "Return Rule",
      "Default UOM",
      "Status",
    ],
    statusCol: 7,
    ids: rows.map((c) => c.id),
    rows: rows.map((c) => [
      c.code,
      c.nameEn,
      c.parentName ?? "—",
      c.skuCount,
      c.attributes.length,
      c.returnRule,
      c.defaultUom,
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
      },
      {
        label: "Non-Returnable",
        value: String(rows.filter((c) => !c.returnable).length),
        sub: "Return rule blocked",
        tone: "warning",
      },
      {
        label: "Empty Categories",
        value: String(rows.filter((c) => c.skuCount === 0).length),
        sub: "No SKUs mapped",
        tone: rows.some((c) => c.skuCount === 0) ? "warning" : "success",
      },
    ],
  };
}

export function mapProducts(rows: ProductDto[]): LiveTable {
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
      "Stock",
      "Status",
    ],
    statusCol: 10,
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
      p.totalOnHand,
      p.returnable ? p.status : "Non-Returnable",
    ]),
    kpis: [
      {
        label: "Active SKUs",
        value: String(rows.filter((p) => p.status === "Active").length),
        sub: `${rows.length} total`,
        tone: "success",
      },
      {
        label: "Inactive SKUs",
        value: String(rows.filter((p) => p.status === "Inactive").length),
        sub: "Discontinued",
        tone: "muted",
      },
      {
        label: "Low Stock SKUs",
        value: String(
          rows.filter((p) => p.totalAvailable > 0 && p.totalAvailable <= p.reorderLevel).length,
        ),
        sub: "Reorder now",
        tone: "warning",
      },
      {
        label: "Missing Barcode",
        value: String(rows.filter((p) => !p.barcode).length),
        sub: "Blocks POS scan",
        tone: rows.some((p) => !p.barcode) ? "critical" : "success",
      },
    ],
  };
}
