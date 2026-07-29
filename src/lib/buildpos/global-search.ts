import type { ProductDto } from "@/lib/api/catalog";
import type { CustomerDto, OrderDto, QuotationDto } from "@/lib/api/pos";

// What the app-header search box matches, kept out of AppLayout so the matching rules can be tested
// without a router and an auth session. Two behaviours this owes the reader:
//   • a broad word ("wire") answers with the CATEGORIES it spans, not just the first five SKUs —
//     picking one narrows the catalog instead of scrolling every match;
//   • an order or quote number is matched too. It matches nothing in the catalog, so leaving orders
//     out is what made a real "ORD-2026-0024" come back as "No matches".

export type GlobalSearchSources = {
  products?: ProductDto[];
  customers?: CustomerDto[];
  orders?: OrderDto[];
  quotations?: QuotationDto[];
};

export type GlobalSearchResults = {
  categories: { name: string; count: number }[];
  products: ProductDto[];
  orders: OrderDto[];
  quotations: QuotationDto[];
  customers: CustomerDto[];
  /** Total matches before the per-group cap — drives the "See all N…" rows. */
  productTotal: number;
  orderTotal: number;
};

const GROUP_LIMIT = 5;

const EMPTY: GlobalSearchResults = {
  categories: [], products: [], orders: [], quotations: [], customers: [], productTotal: 0, orderTotal: 0,
};

export function globalSearch(query: string, sources: GlobalSearchSources): GlobalSearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return EMPTY;
  const has = (value: string | null | undefined) => (value ?? "").toLowerCase().includes(q);

  // Widened beyond sku/name/barcode: a shopper's word for a product ("wire", "cable") is far more
  // likely to be the category or brand than the SKU, and matching only the three narrow fields is
  // what made a plausible search look like it returned nothing.
  const products = (sources.products ?? []).filter(
    (p) => has(p.sku) || has(p.nameEn) || has(p.nameAr) || has(p.brand) || has(p.categoryName) || has(p.barcode),
  );

  const categoryCounts = new Map<string, number>();
  for (const p of products) {
    if (!p.categoryName) continue;
    categoryCounts.set(p.categoryName, (categoryCounts.get(p.categoryName) ?? 0) + 1);
  }
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, GROUP_LIMIT)
    .map(([name, count]) => ({ name, count }));

  const orders = (sources.orders ?? []).filter(
    (o) => has(o.orderNo) || has(o.customerName) || has(o.projectCode) || has(o.poReference),
  );
  const quotations = (sources.quotations ?? []).filter(
    (qt) => has(qt.quoteNo) || has(qt.customerName) || has(qt.projectCode),
  );
  const customers = (sources.customers ?? []).filter((c) => has(c.nameEn) || has(c.phone));

  return {
    categories,
    products: products.slice(0, GROUP_LIMIT),
    orders: orders.slice(0, GROUP_LIMIT),
    quotations: quotations.slice(0, GROUP_LIMIT),
    customers: customers.slice(0, GROUP_LIMIT),
    productTotal: products.length,
    orderTotal: orders.length,
  };
}

export function hasGlobalSearchResults(results: GlobalSearchResults): boolean {
  return (
    results.categories.length > 0 ||
    results.products.length > 0 ||
    results.orders.length > 0 ||
    results.quotations.length > 0 ||
    results.customers.length > 0
  );
}
