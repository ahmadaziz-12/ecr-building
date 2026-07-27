import type { CheckoutRequest, OrderDto } from "@/lib/api/pos";
import { apiPost } from "@/lib/api/client";

// Module 10 (BRD §13 offline mode): when checkout fails on a NETWORK error (fetch throws before any
// HTTP response), the full request is queued locally and replayed automatically when connectivity
// returns. Every queued request carries a clientRequestId, so a replay that races a half-delivered
// original can never double-sell — the server returns the original order for a repeated id.
// localStorage comfortably holds the BRD's 50-transaction acceptance criterion; a service-worker
// upgrade can come later without changing this contract.

const STORAGE_KEY = "buildpos.offline-checkout-queue";

export type QueuedCheckout = { clientRequestId: string; request: CheckoutRequest; queuedAt: string };

export function isNetworkError(err: unknown): boolean {
  // fetch rejects with TypeError when the network is unreachable — an HTTP error (4xx/5xx) means the
  // server DID answer and must never be queued (it would replay a request the server already rejected).
  return err instanceof TypeError;
}

export function readQueue(): QueuedCheckout[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as QueuedCheckout[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedCheckout[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function newClientRequestId(): string {
  return `offline-${crypto.randomUUID()}`;
}

export function enqueueCheckout(request: CheckoutRequest): QueuedCheckout {
  const clientRequestId = request.clientRequestId ?? newClientRequestId();
  const entry: QueuedCheckout = {
    clientRequestId,
    request: { ...request, clientRequestId },
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...readQueue(), entry]);
  return entry;
}

export type ReplayResult = { synced: OrderDto[]; failed: { entry: QueuedCheckout; error: string }[] };

/**
 * Replays the queue in original order. Network failures stop the run (still offline — everything
 * left stays queued); a server REJECTION (e.g. stock sold out while offline) is surfaced and dropped
 * from the queue so one bad transaction can't wedge the rest behind it.
 */
export async function replayQueue(): Promise<ReplayResult> {
  const queue = readQueue();
  const synced: OrderDto[] = [];
  const failed: ReplayResult["failed"] = [];
  const remaining = [...queue];

  for (const entry of queue) {
    try {
      const order = await apiPost<OrderDto>("/api/pos/orders", entry.request);
      synced.push(order);
      remaining.shift();
    } catch (err) {
      if (isNetworkError(err)) {
        break; // still offline — keep this and everything after it queued
      }
      failed.push({ entry, error: err instanceof Error ? err.message : "Rejected by server" });
      remaining.shift();
    }
  }

  writeQueue(remaining);
  return { synced, failed };
}
