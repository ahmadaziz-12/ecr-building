// Persistent layer over the master seed (seed-master.ts).
//
// Records the user creates in the preview — completed POS sales, new customers, payments — are
// appended here and merged on top of the seeded records. Nothing seeded is ever deleted or
// replaced: merge order is `seed first, local appended`, deduplicated by business key.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, CheckoutRequest, CustomerDto, OrderDto, OrderLineDto } from "@/lib/api/pos";
import type { ProductDto } from "@/lib/api/catalog";
import { SEED_CUSTOMER_DTOS, SEED_ORDER_DTOS } from "./seed-master";
import { SEED_PRODUCT_DTOS } from "./seed-products";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SeedState = {
  /** Sales completed in this browser, newest first. */
  orders: OrderDto[];
  /** Customers created in this browser. */
  customers: CustomerDto[];
  /** productId → stock units sold locally (subtracted from seeded availability). */
  soldStock: Record<number, number>;
  nextOrderSeq: number;
  addOrder: (order: OrderDto) => void;
  addCustomer: (customer: CustomerDto) => CustomerDto;
  takeOrderSeq: () => number;
  reset: () => void;
};

export const useSeedStore = create<SeedState>()(
  persist(
    (set, get) => ({
      orders: [],
      customers: [],
      soldStock: {},
      nextOrderSeq: 8096,
      addOrder: (order) =>
        set((s) => {
          const soldStock = { ...s.soldStock };
          for (const l of order.lines) {
            soldStock[l.productId] = round2((soldStock[l.productId] ?? 0) + (l.stockQty || l.qty));
          }
          return { orders: [order, ...s.orders.filter((o) => o.orderNo !== order.orderNo)], soldStock };
        }),
      addCustomer: (c) => {
        set((s) => ({ customers: [...s.customers.filter((x) => x.id !== c.id), c] }));
        return c;
      },
      takeOrderSeq: () => {
        const seq = get().nextOrderSeq;
        set({ nextOrderSeq: seq + 1 });
        return seq;
      },
      reset: () => set({ orders: [], customers: [], soldStock: {}, nextOrderSeq: 8096 }),
    }),
    { name: "buildpos-seed-v1" },
  ),
);

/* ---------- merge helpers (seed + locally created) ---------- */

export function mergedOrders(local: OrderDto[]): OrderDto[] {
  const seen = new Set(local.map((o) => o.orderNo));
  return [...local, ...SEED_ORDER_DTOS.filter((o) => !seen.has(o.orderNo))];
}

export function mergedCustomers(local: CustomerDto[]): CustomerDto[] {
  const seen = new Set(local.map((c) => c.id));
  return [...SEED_CUSTOMER_DTOS.filter((c) => !seen.has(c.id)), ...local];
}

/** Seeded products with locally-sold quantities deducted so POS stock stays consistent. */
export function mergedProducts(sold: Record<number, number>, base: ProductDto[] = SEED_PRODUCT_DTOS): ProductDto[] {
  if (!sold || Object.keys(sold).length === 0) return base;
  return base.map((p) => {
    const used = sold[p.id] ?? 0;
    if (!used) return p;
    return {
      ...p,
      totalOnHand: Math.max(0, round2(p.totalOnHand - used)),
      totalAvailable: Math.max(0, round2(p.totalAvailable - used)),
    };
  });
}

/* ---------- checkout ---------- */

export type CheckoutContext = {
  branchName?: string;
  cashierName?: string;
  customerName?: string;
  products?: ProductDto[];
};

/**
 * Builds a fully-costed OrderDto from a POS checkout request — used as the local fallback when the
 * .NET API isn't reachable, so completing a sale in preview still produces a real, persisted order
 * with lines, VAT, fees, payments and a payment status.
 */
export function buildOrderFromCheckout(
  request: CheckoutRequest,
  orderSeq: number,
  ctx: CheckoutContext = {},
): OrderDto {
  const catalog = ctx.products?.length ? ctx.products : SEED_PRODUCT_DTOS;
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const lines: OrderLineDto[] = (request.lines ?? []).map((l: CartLine, i: number) => {
    const p = byId.get(l.productId);
    const uom = l.uom || p?.stockUom || "Unit";
    const factor = p?.uomConversions?.find((c) => c.uom === uom)?.factorToStock ?? 1;
    const listPrice = p?.sellingPrice ?? 0;
    const unitPrice = round2(l.manualUnitPrice ?? listPrice * factor);
    const discountPct = l.manualDiscountPct ?? 0;
    const gross = unitPrice * l.qty;
    const lineTotal = round2(gross * (1 - discountPct / 100));
    return {
      id: i + 1,
      productId: l.productId,
      sku: p?.sku ?? `SKU-${l.productId}`,
      productName: p?.nameEn ?? `Product ${l.productId}`,
      qty: l.qty,
      unitPrice,
      discountPct,
      vatRate: p?.vatRate ?? 15,
      lineTotal,
      uom,
      stockQty: round2(l.qty * factor),
      lengthM: l.lengthM ?? null,
      widthM: l.widthM ?? null,
      heightM: l.heightM ?? null,
      bundleId: null,
      bundleName: null,
      lineWeight: round2((p?.weight ?? 0) * l.qty * factor),
      notes: l.notes ?? null,
    };
  });

  const grossTotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const lineNet = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  let discountTotal = round2(grossTotal - lineNet);

  let netAfterDiscount = lineNet;
  if (request.manualDiscount && request.manualDiscount.value > 0) {
    const md =
      request.manualDiscount.type === "Percentage"
        ? round2(lineNet * (request.manualDiscount.value / 100))
        : round2(Math.min(request.manualDiscount.value, lineNet));
    discountTotal = round2(discountTotal + md);
    netAfterDiscount = round2(lineNet - md);
  }

  const feesTotal = round2((request.customFees ?? []).reduce((s, f) => s + f.amount, 0));
  const vatTotal = round2(
    lines.reduce((s, l) => {
      const share = lineNet > 0 ? l.lineTotal / lineNet : 0;
      return s + netAfterDiscount * share * ((l.vatRate ?? 15) / 100);
    }, 0),
  );
  const grandTotal = round2(netAfterDiscount + vatTotal + feesTotal);

  const paid = round2((request.payments ?? []).reduce((s, p) => s + p.amount, 0));
  const paymentStatus = paid <= 0 ? "Unpaid" : paid + 0.01 >= grandTotal ? "Paid" : "Partially Paid";

  const now = new Date().toISOString();
  return {
    id: orderSeq,
    orderNo: `ORD-2026-${orderSeq}`,
    branchId: request.branchId,
    branchName: ctx.branchName ?? "Riyadh Main Branch",
    terminalId: request.terminalId ?? null,
    cashierName: ctx.cashierName ?? "Ahmed Al-Harbi",
    customerId: request.customerId ?? null,
    customerName: ctx.customerName ?? "Walk-in Customer",
    type: request.type || "Retail",
    status: paymentStatus === "Paid" ? "Completed" : "Pending Payment",
    paymentStatus,
    subTotal: netAfterDiscount,
    discountTotal,
    bundleDiscountTotal: 0,
    vatTotal,
    feesTotal,
    grandTotal,
    createdAt: now,
    lines,
    payments: (request.payments ?? []).map((p, i) => ({
      id: orderSeq * 10 + i,
      method: p.method,
      amount: round2(p.amount),
      referenceNumber: null,
      status: p.method === "Bank Transfer" ? "Pending Confirmation" : "Approved",
      createdAt: now,
    })),
    fees: (request.customFees ?? []).map((f) => ({ label: f.label, amount: f.amount })),
    loyaltyPointsEarned: null,
    loyaltyPointsBalance: null,
    loyaltyNextTierThreshold: null,
    loyaltyPointsRedeemed: null,
    deliveryOrderId: null,
    deliveryOrderNo: null,
    deliveryStage: request.delivery ? "Pending" : null,
    poReference: request.poReference ?? null,
    projectCode: request.projectCode ?? null,
  };
}
