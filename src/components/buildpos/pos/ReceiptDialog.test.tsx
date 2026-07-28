import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { API_BASE } from "@/lib/api/client";
import type { OrderDto } from "@/lib/api/pos";
import { ReceiptDialog } from "./ReceiptDialog";

// Module 2 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — the receipt must show points earned this
// transaction, the updated balance, and the next tier threshold (BRD §4.3.1), sourced from the new
// loyaltyPointsEarned/loyaltyPointsBalance/loyaltyNextTierThreshold fields on the checkout response.
function baseOrder(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 1,
    orderNo: "ORD-2026-0001",
    branchId: 1,
    branchName: "Main Branch",
    terminalId: null,
    cashierName: "Cashier",
    customerId: 1,
    customerName: "Ahmed Al-Rashid",
    type: "Retail",
    status: "Completed",
    paymentStatus: "Paid",
    subTotal: 100,
    discountTotal: 0,
    bundleDiscountTotal: 0,
    vatTotal: 0,
    feesTotal: 0,
    grandTotal: 100,
    createdAt: new Date(0).toISOString(),
    lines: [
      {
        id: 1,
        productId: 1,
        sku: "CEM-001",
        productName: "Portland Cement 50kg",
        qty: 1,
        unitPrice: 100,
        discountPct: 0,
        vatRate: 0,
        lineTotal: 100,
        uom: "Bag",
        stockQty: 1,
        lengthM: null,
        widthM: null,
        heightM: null,
        bundleId: null,
        bundleName: null,
        lineWeight: 0,
      },
    ],
    payments: [
      {
        method: "Cash",
        amount: 100,
        referenceNumber: null,
        status: "Completed",
        createdAt: new Date(0).toISOString(),
      },
    ],
    fees: [],
    loyaltyPointsEarned: null,
    loyaltyPointsBalance: null,
    loyaltyNextTierThreshold: null,
    loyaltyPointsRedeemed: null,
    deliveryOrderId: null,
    deliveryOrderNo: null,
    deliveryStage: null,
    poReference: null,
    projectCode: null,
    ...overrides,
  };
}

function renderReceipt(order: OrderDto) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  server.use(
    http.get(`${API_BASE}/api/zatca/invoices/by-order/:orderId`, () =>
      HttpResponse.json(null, { status: 404 }),
    ),
    http.get(`${API_BASE}/api/network/devices`, () => HttpResponse.json([])),
    http.post(`${API_BASE}/api/print/receipt`, () =>
      HttpResponse.json({ id: 1, escPosBase64: "" }),
    ),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <ReceiptDialog order={order} terminalId={null} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ReceiptDialog loyalty section", () => {
  it("shows nothing loyalty-related for a walk-in / non-loyalty order", () => {
    renderReceipt(baseOrder());

    expect(screen.queryByText("Points earned")).not.toBeInTheDocument();
  });

  it("shows points earned, balance, and next tier threshold for a loyalty customer", () => {
    renderReceipt(
      baseOrder({
        loyaltyPointsEarned: 10,
        loyaltyPointsBalance: 505,
        loyaltyNextTierThreshold: 2000,
      }),
    );

    expect(screen.getByText("Points earned")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("505")).toBeInTheDocument();
    expect(screen.getByText("2000 pts")).toBeInTheDocument();
  });

  it("omits the next-tier line once the customer is already at the top tier", () => {
    renderReceipt(
      baseOrder({
        loyaltyPointsEarned: 10,
        loyaltyPointsBalance: 6000,
        loyaltyNextTierThreshold: null,
      }),
    );

    expect(screen.getByText("Points balance")).toBeInTheDocument();
    expect(screen.queryByText("Next tier at")).not.toBeInTheDocument();
  });
});
