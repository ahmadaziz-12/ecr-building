import { useEffect, useRef, useCallback, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_BASE } from "@/lib/api/client";

// Mirrors a cashier's in-progress cart to a paired customer-facing display in real time. Kept as a
// dumb relay end to end: PosSessionHub on the server never re-prices anything, it just forwards
// whatever PosCheckout already computed — so this file has no pricing logic of its own either.
export type CustomerDisplayLine = {
  name: string;
  qty: number;
  uom: string;
  unitPrice: number;
  lineTotal: number;
};
export type CustomerDisplayAmountLine = { label: string; amount: number };
export type CustomerDisplayStatus = "Idle" | "Building" | "Processing" | "Approved";
export type CustomerDisplaySnapshot = {
  status: CustomerDisplayStatus;
  lines: CustomerDisplayLine[];
  subtotal: number;
  discounts: CustomerDisplayAmountLine[];
  fees: CustomerDisplayAmountLine[];
  vat: number;
  total: number;
  customerName: string | null;
  orderNo: string | null;
  // BRD §4.3.3: same loyalty tier + points (+ SAR equivalent) PosCheckout's own customer card shows.
  customerLoyaltyTier?: string | null;
  customerLoyaltyPoints?: number | null;
  customerLoyaltyPointsSarValue?: number | null;
};

// The customer display's "key" — a terminal id carried in the URL so opening the same link (from
// PosCheckout's Copy Link, or a bookmark on a tablet) always pairs to that ONE terminal, with no
// picker step. Any number of windows/tablets opened with the same key join the same SignalR group
// (see PosSessionHub's per-terminal groups) and update in lockstep; a different key is a different
// group and never sees another terminal's cart. Shared here (not duplicated in PosCheckout and
// CustomerDisplayPage separately) so the param name can't drift between the writer and the reader.
export const TERMINAL_KEY_PARAM = "terminal";

export function customerDisplayPath(terminalId: number): string {
  return `/operate/customer-display?${TERMINAL_KEY_PARAM}=${terminalId}`;
}

export const IDLE_SNAPSHOT: CustomerDisplaySnapshot = {
  status: "Idle",
  lines: [],
  subtotal: 0,
  discounts: [],
  fees: [],
  vat: 0,
  total: 0,
  customerName: null,
  orderNo: null,
};

function buildConnection() {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE}/hubs/pos-session`, { withCredentials: true })
    .withAutomaticReconnect()
    .build();
}

// Cashier side: joins the terminal's group and exposes a function to push the latest snapshot, plus
// whether the join has actually landed yet. That second part matters on a fresh page load/refresh:
// the connection handshake is async, so the very first push — fired from PosCheckout's own effect in
// the same tick as mount — would otherwise race the connection and get silently dropped, leaving the
// customer display stuck showing whatever it had before the refresh until the cart next changes.
// Exposing `connected` lets the caller add it to that effect's own dependencies so the current state
// gets (re)pushed the instant the join actually completes, refresh or not. Reconnects transparently
// (withAutomaticReconnect) and silently re-joins the group on reconnect — a dropped wifi blip on the
// till shouldn't require the cashier to do anything.
export function usePosSessionBroadcaster(terminalId: number | null): {
  pushSnapshot: (snapshot: CustomerDisplaySnapshot) => void;
  connected: boolean;
} {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(false);
    if (terminalId == null) return;
    const connection = buildConnection();
    connectionRef.current = connection;

    const join = () =>
      connection
        .invoke("JoinTerminal", terminalId)
        .then(() => setConnected(true))
        .catch(() => setConnected(false));
    connection.onreconnected(join);
    connection.onclose(() => setConnected(false));
    connection.start().then(join).catch(() => {});

    return () => {
      connectionRef.current = null;
      setConnected(false);
      connection.stop();
    };
  }, [terminalId]);

  const pushSnapshot = useCallback(
    (snapshot: CustomerDisplaySnapshot) => {
      const connection = connectionRef.current;
      if (terminalId == null || !connection || connection.state !== signalR.HubConnectionState.Connected) {
        return;
      }
      connection.invoke("PushCartSnapshot", terminalId, snapshot).catch(() => {});
    },
    [terminalId],
  );

  return { pushSnapshot, connected };
}

// Display side: joins the same terminal group and calls onUpdate for every snapshot the cashier
// pushes. onUpdate is read through a ref so callers don't need to memoize it themselves. The join
// itself can be refused server-side (PosSessionHub.CanAccessAsync) — wrong branch, or no POS/display
// permission at all — surfaced here as `restricted` so the caller can show that instead of silently
// sitting on an empty screen forever with no explanation.
export function usePosSessionListener(
  terminalId: number | null,
  onUpdate: (snapshot: CustomerDisplaySnapshot) => void,
): { restricted: boolean } {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    setRestricted(false);
    if (terminalId == null) return;
    const connection = buildConnection();
    connection.on("CartUpdated", (snapshot: CustomerDisplaySnapshot) => onUpdateRef.current(snapshot));

    const join = () =>
      connection
        .invoke("JoinTerminal", terminalId)
        .then(() => setRestricted(false))
        .catch(() => setRestricted(true));
    connection.onreconnected(join);
    connection.start().then(join).catch(() => setRestricted(true));

    return () => {
      connection.stop();
    };
  }, [terminalId]);

  return { restricted };
}
