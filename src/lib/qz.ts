// Real QZ Tray integration — browser-to-USB/network printer bridge (qz.io).
// Requires QZ Tray installed and running on the till: https://qz.io/download/
// If it isn't running, qzConnect() rejects and every caller here falls back to the
// existing DB-backed virtual print (see PrinterSetupDialog.tsx / ReceiptDialog.tsx) —
// this module never blocks a sale on printer connectivity.

import qz from "qz-tray";
import { API_BASE } from "@/lib/api/client";

// Cert-signed mode: QZ Tray asks the page to resolve a certificate + a signature per
// print call. Both are relayed to our backend (which owns the RSA keypair) rather than
// generated in the browser, so the private key never leaves the server.
qz.security.setSignatureAlgorithm("SHA1");
qz.security.setCertificatePromise((resolve) => {
  fetch(`${API_BASE}/api/printer/qz-certificate`, { credentials: "include" })
    .then((r) => (r.ok ? r.text() : Promise.reject(r.statusText)))
    .then(resolve)
    .catch(() => resolve(null));
});
qz.security.setSignaturePromise((toSign) => (resolve) => {
  fetch(`${API_BASE}/api/printer/qz-sign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toSign }),
  })
    .then((r) => (r.ok ? r.text() : Promise.reject(r.statusText)))
    .then(resolve)
    .catch(() => resolve(null));
});

let connectPromise: Promise<void> | null = null;

export async function qzConnect(): Promise<void> {
  if (qz.websocket.isActive()) return;
  if (connectPromise) return connectPromise;
  connectPromise = qz.websocket.connect({ retries: 1, delay: 0 }).finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

export async function qzDisconnect(): Promise<void> {
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function qzIsConnected(): boolean {
  return qz.websocket.isActive();
}

export async function qzListPrinters(): Promise<string[]> {
  await qzConnect();
  const result = await qz.printers.find();
  return Array.isArray(result) ? result : [result].filter(Boolean);
}

export async function qzGetDefaultPrinter(): Promise<string> {
  await qzConnect();
  return qz.printers.getDefault();
}

// Sends a base64-encoded ESC/POS byte stream (as produced by the backend's EscPosBuilder,
// e.g. PrintJobDto.escPosBase64) straight to the named OS printer as a raw print job —
// no PDF/driver rendering in between, so control codes (cut, QR, bold) reach the printer intact.
export async function qzPrintRaw(escPosBase64: string, printerName: string): Promise<void> {
  await qzConnect();
  const config = qz.configs.create(printerName, { raw: true });
  await qz.print(config, [{ type: "raw", format: "base64", data: escPosBase64 }]);
}
