import { describe, expect, it } from "vitest";
import { globalSearch, hasGlobalSearchResults } from "./global-search";
import type { ProductDto } from "@/lib/api/catalog";
import type { CustomerDto, OrderDto, QuotationDto } from "@/lib/api/pos";

function product(overrides: Partial<ProductDto>): ProductDto {
  return {
    id: 1, sku: "SKU-1", nameEn: "Item", nameAr: null, categoryId: 1, categoryName: "Misc",
    brand: null, barcode: null, uom: "Piece", costPrice: 0, sellingPrice: 0, vatRate: 15,
    reorderLevel: 0, onHand: 0, status: "Active",
    ...overrides,
  } as ProductDto;
}
function order(overrides: Partial<OrderDto>): OrderDto {
  return {
    id: 1, orderNo: "ORD-2026-0001", branchId: 1, branchName: "Riyadh", terminalId: 1,
    cashierName: "Yousef", customerId: null, customerName: "Walk-in", type: "Retail",
    status: "Completed", paymentStatus: "Paid", projectCode: null, poReference: null,
    ...overrides,
  } as OrderDto;
}
function quotation(overrides: Partial<QuotationDto>): QuotationDto {
  return {
    id: 1, quoteNo: "QUO-2026-0001", branchId: 1, customerId: null, customerName: "Al-Nasser",
    createdByName: "Mona", status: "Sent", projectCode: "PRJ-1",
    ...overrides,
  } as QuotationDto;
}
function customer(overrides: Partial<CustomerDto>): CustomerDto {
  return { id: 1, nameEn: "Walk-in", phone: null, ...overrides } as CustomerDto;
}

describe("globalSearch", () => {
  it("returns nothing for a blank or whitespace-only term", () => {
    expect(hasGlobalSearchResults(globalSearch("   ", { products: [product({})] }))).toBe(false);
  });

  it("answers a broad term with the categories it spans, largest first", () => {
    const results = globalSearch("wire", {
      products: [
        product({ id: 1, sku: "WIR-CU-1", nameEn: "Copper Wire 1.5mm", categoryName: "Electrical Wiring" }),
        product({ id: 2, sku: "WIR-CU-2", nameEn: "Copper Wire 2.5mm", categoryName: "Electrical Wiring" }),
        product({ id: 3, sku: "WIR-BND", nameEn: "Binding Wire", categoryName: "Steel & Rebar" }),
        product({ id: 4, sku: "CEM-01", nameEn: "Portland Cement", categoryName: "Cement" }),
      ],
    });

    expect(results.categories).toEqual([
      { name: "Electrical Wiring", count: 2 },
      { name: "Steel & Rebar", count: 1 },
    ]);
    expect(results.productTotal).toBe(3);
  });

  it("matches a product by category or brand, not just SKU and name", () => {
    const results = globalSearch("knauf", {
      products: [product({ nameEn: "Gypsum Board 12mm", brand: "Knauf", categoryName: "Drywall" })],
    });

    expect(results.products).toHaveLength(1);
  });

  it("finds an order by its order number", () => {
    const results = globalSearch("ORD-2026-0024", {
      orders: [order({ id: 7, orderNo: "ORD-2026-0024" }), order({ id: 8, orderNo: "ORD-2026-0025" })],
    });

    expect(results.orders.map((o) => o.id)).toEqual([7]);
    expect(hasGlobalSearchResults(results)).toBe(true);
  });

  it("ignores surrounding whitespace and case in the term", () => {
    const results = globalSearch("  ord-2026-0024 ", { orders: [order({ orderNo: "ORD-2026-0024" })] });

    expect(results.orders).toHaveLength(1);
  });

  it("also matches orders by customer, project code and PO reference", () => {
    const orders = [
      order({ id: 1, customerName: "Al-Nasser Contracting" }),
      order({ id: 2, projectCode: "PRJ-VILLA-12" }),
      order({ id: 3, poReference: "PO-88231" }),
      order({ id: 4 }),
    ];

    expect(globalSearch("nasser", { orders }).orders.map((o) => o.id)).toEqual([1]);
    expect(globalSearch("villa", { orders }).orders.map((o) => o.id)).toEqual([2]);
    expect(globalSearch("88231", { orders }).orders.map((o) => o.id)).toEqual([3]);
  });

  it("finds a quotation by its quote number", () => {
    const results = globalSearch("QUO-2026-0009", {
      quotations: [quotation({ id: 3, quoteNo: "QUO-2026-0009" })],
    });

    expect(results.quotations.map((q) => q.id)).toEqual([3]);
  });

  it("caps each group at five but reports the true totals", () => {
    const results = globalSearch("wire", {
      products: Array.from({ length: 9 }, (_, i) => product({ id: i, sku: `WIR-${i}`, nameEn: "Wire" })),
      orders: Array.from({ length: 7 }, (_, i) => order({ id: i, customerName: "Wireworks Ltd" })),
    });

    expect(results.products).toHaveLength(5);
    expect(results.productTotal).toBe(9);
    expect(results.orders).toHaveLength(5);
    expect(results.orderTotal).toBe(7);
  });

  it("tolerates sources that have not loaded yet", () => {
    const results = globalSearch("anything", {});

    expect(hasGlobalSearchResults(results)).toBe(false);
  });

  it("matches a customer by name or phone", () => {
    const customers = [customer({ id: 1, nameEn: "Fahad Al-Otaibi", phone: "0551234567" })];

    expect(globalSearch("otaibi", { customers }).customers).toHaveLength(1);
    expect(globalSearch("0551234", { customers }).customers).toHaveLength(1);
  });
});
