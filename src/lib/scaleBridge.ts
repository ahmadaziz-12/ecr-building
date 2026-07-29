// Weighing Scale integration — reuses the already-installed QZ Tray bridge (src/lib/qz.ts) via its
// Serial Port API (qz.serial.*) to read a scale's live weight straight from its COM/serial port, the
// same way src/lib/qz.ts already talks to receipt/label printers over QZ Tray. No separate companion
// service is needed: QZ Tray itself IS the local bridge for both printers and serial devices.
//
// Serial scale protocols vary a lot by manufacturer/model (there is no physical scale to test against
// in this environment) — this listens for raw ASCII frames off the wire and best-effort extracts a
// decimal weight from them, matching the common "<sign><digits>.<digits>[kg|g]" shape most cheap
// serial scales emit (e.g. Toledo/CAS-style "ST,GS,+001.234kg"). If a specific scale's frame format
// differs, adjust WEIGHT_PATTERN/parseWeightFrame below rather than the callers.
import { useEffect, useState } from "react";
import qz from "qz-tray";
import { qzConnect } from "@/lib/qz";

export type ScaleReading = { weightKg: number; raw: string; stable: boolean };

const WEIGHT_PATTERN = /(-?\d+\.\d+|-?\d+)\s*(kg|g)?/i;
// Many serial scales prefix an unsettled (still-moving) reading with a flag like "US"/"UNSTABLE" —
// a stable reading is usually flagged "ST"/"STABLE" or has no flag at all.
const UNSTABLE_PATTERN = /\bus\b|unstable|motion/i;

export function parseWeightFrame(raw: string): ScaleReading | null {
  const match = raw.match(WEIGHT_PATTERN);
  if (!match) return null;
  let weightKg = parseFloat(match[1]);
  if (Number.isNaN(weightKg)) return null;
  if (match[2]?.toLowerCase() === "g") weightKg /= 1000;
  return { weightKg, raw, stable: !UNSTABLE_PATTERN.test(raw) };
}

const listeners = new Set<(reading: ScaleReading) => void>();
let callbacksAttached = false;
const openPorts = new Set<string>();

function ensureCallbacksAttached() {
  if (callbacksAttached) return;
  callbacksAttached = true;
  qz.serial.setSerialCallbacks((evt) => {
    if (!evt.output) return;
    const reading = parseWeightFrame(evt.output);
    if (reading) listeners.forEach((fn) => fn(reading));
  });
}

export async function scaleOpenPort(portName: string, baudRate = 9600): Promise<void> {
  await qzConnect();
  ensureCallbacksAttached();
  if (openPorts.has(portName)) return;
  await qz.serial.openPort(portName, { baudRate, rx: { untilNewline: true } });
  openPorts.add(portName);
}

export async function scaleClosePort(portName: string): Promise<void> {
  if (!openPorts.has(portName)) return;
  openPorts.delete(portName);
  if (qz.websocket.isActive()) {
    await qz.serial.closePort(portName).catch(() => undefined);
  }
}

export async function scaleFindPorts(): Promise<string[]> {
  await qzConnect();
  return qz.serial.findPorts();
}

function onScaleReading(fn: (reading: ScaleReading) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Opens (and cleans up) the given port for the lifetime of the consuming component, exposing the
// latest weight reading. `portName` is the scale Device's paired serial port (stored in the same
// `qzPrinterName` field a printer Device uses for its QZ printer name — repurposed here as a generic
// "QZ target identifier" string rather than adding a parallel schema column).
export function useScaleWeight(portName: string | null): { weightKg: number | null; connected: boolean; stable: boolean } {
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setReading(null);
    setConnected(false);
    if (!portName) return;
    let cancelled = false;

    scaleOpenPort(portName)
      .then(() => { if (!cancelled) setConnected(true); })
      .catch(() => { if (!cancelled) setConnected(false); });
    const unsubscribe = onScaleReading((r) => { if (!cancelled) setReading(r); });

    return () => {
      cancelled = true;
      unsubscribe();
      void scaleClosePort(portName);
    };
  }, [portName]);

  return { weightKg: reading?.weightKg ?? null, connected, stable: reading?.stable ?? false };
}
