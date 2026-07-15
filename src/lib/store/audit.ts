import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEvent = {
  id: string;
  module: "delivery" | "hr" | "system";
  event: string;
  recordId?: string;
  employee?: string;
  user?: string;
  branch?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  severity: AuditSeverity;
  device?: string;
  ts: number; // epoch ms
};

type S = {
  events: AuditEvent[];
  log: (e: Omit<AuditEvent, "id" | "ts">) => void;
  clear: () => void;
};

let counter = 1;
function nextId(mod: string) {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(1000 + counter++).slice(-4);
  const tag = mod === "delivery" ? "DEV" : mod === "hr" ? "HRA" : "SYS";
  return `${tag}-${y}-${seq}`;
}

export const useAuditStore = create<S>()(
  persist(
    (set) => ({
      events: [],
      log: (e) =>
        set((s) => ({
          events: [{ ...e, id: nextId(e.module), ts: Date.now() }, ...s.events].slice(0, 500),
        })),
      clear: () => set({ events: [] }),
    }),
    { name: "buildpos-audit-v1" }
  )
);