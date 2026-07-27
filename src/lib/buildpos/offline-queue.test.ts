import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { API_BASE } from "@/lib/api/client";
import { enqueueCheckout, isNetworkError, readQueue, replayQueue } from "./offline-queue";
import type { CheckoutRequest } from "@/lib/api/pos";

// Module 10 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — offline checkout queue: sales survive a network
// outage locally and replay exactly once when connectivity returns (BRD acceptance criterion 9).
function checkoutRequest(): CheckoutRequest {
  return {
    branchId: 1, terminalId: null, customerId: null, type: "Retail",
    lines: [{ productId: 1, qty: 2 }],
    payments: [{ method: "Cash", amount: 200 }],
  };
}

describe("offline checkout queue", () => {
  beforeEach(() => localStorage.clear());

  it("classifies only transport failures as network errors — HTTP rejections are not queueable", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Insufficient stock"))).toBe(false);
  });

  it("assigns every queued sale a client request id and preserves order", () => {
    const first = enqueueCheckout(checkoutRequest());
    const second = enqueueCheckout(checkoutRequest());
    const queue = readQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].clientRequestId).toBe(first.clientRequestId);
    expect(queue[1].clientRequestId).toBe(second.clientRequestId);
    expect(first.clientRequestId).not.toBe(second.clientRequestId);
    expect(queue[0].request.clientRequestId).toBe(first.clientRequestId);
  });

  it("replays queued sales in order and empties the queue on success", async () => {
    enqueueCheckout(checkoutRequest());
    enqueueCheckout(checkoutRequest());
    const received: string[] = [];
    server.use(
      http.post(`${API_BASE}/api/pos/orders`, async ({ request }) => {
        const body = (await request.json()) as { clientRequestId: string };
        received.push(body.clientRequestId);
        return HttpResponse.json({ id: received.length, orderNo: `ORD-${received.length}`, grandTotal: 200 });
      }),
    );

    const result = await replayQueue();

    expect(result.synced).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(readQueue()).toHaveLength(0);
    expect(received).toHaveLength(2);
  });

  it("keeps everything queued when still offline, but drops server-rejected sales with an error", async () => {
    enqueueCheckout(checkoutRequest());
    enqueueCheckout(checkoutRequest());

    // Still offline: transport error → both stay queued.
    server.use(http.post(`${API_BASE}/api/pos/orders`, () => HttpResponse.error()));
    const offline = await replayQueue();
    expect(offline.synced).toHaveLength(0);
    expect(readQueue()).toHaveLength(2);

    // Back online but the server rejects the first (e.g. stock sold out meanwhile) — it must be
    // surfaced and dropped so it can't wedge the rest of the queue behind it.
    let call = 0;
    server.use(
      http.post(`${API_BASE}/api/pos/orders`, () => {
        call += 1;
        return call === 1
          ? HttpResponse.json({ error: "Insufficient stock for CEM-001." }, { status: 400 })
          : HttpResponse.json({ id: 9, orderNo: "ORD-9", grandTotal: 200 });
      }),
    );
    const online = await replayQueue();
    expect(online.failed).toHaveLength(1);
    expect(online.failed[0].error).toContain("Insufficient stock");
    expect(online.synced).toHaveLength(1);
    expect(readQueue()).toHaveLength(0);
  });
});
