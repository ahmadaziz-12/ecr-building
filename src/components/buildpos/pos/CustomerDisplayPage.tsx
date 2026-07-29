import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Copy,
  MonitorSmartphone,
  Package,
  Percent,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/api/auth";
import { useTerminals } from "@/lib/api/admin";
import { Money, fmtAmount } from "@/lib/buildpos/currency";
import {
  usePosSessionListener,
  customerDisplayPath,
  IDLE_SNAPSHOT,
  TERMINAL_KEY_PARAM,
  type CustomerDisplaySnapshot,
} from "@/lib/buildpos/pos-session-hub";

// Which register this tablet mirrors. The URL's ?terminal= key (see customerDisplayPath) is the
// primary source — a link copied from PosCheckout or bookmarked on a tablet pairs with no picker
// step. localStorage is only a convenience fallback for a bare /operate/customer-display visit (or
// the picker below), so a plain bookmark still remembers the last register without a key in the URL.
const TERMINAL_STORAGE_KEY = "buildpos.customer-display.terminalId";

function terminalIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get(TERMINAL_KEY_PARAM);
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

// Same gradient/blueprint treatment PosCheckout's own header uses, so a customer glancing between
// the till and this screen sees one consistent brand, not two different apps bolted together.
function DisplayHeader({
  branchName,
  registerName,
  terminalId,
}: {
  branchName?: string;
  registerName?: string;
  terminalId: number;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[oklch(0.22_0.08_285)] via-[oklch(0.18_0.06_285)] to-[oklch(0.12_0.05_285)] px-8 py-5 text-white">
      <div className="blueprint-grid-dark pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">MiMoney BuildPOS</p>
            <p className="font-display text-lg font-semibold">{branchName ?? "Your Order"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {registerName && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium ring-1 ring-white/15">
              {registerName}
            </span>
          )}
          <button
            onClick={() => {
              const url = `${window.location.origin}${customerDisplayPath(terminalId)}`;
              navigator.clipboard.writeText(url);
              toast.success("Link copied", { description: url });
            }}
            title="Copy this register's display link"
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  amount,
  icon,
  tone = "default",
  negative = false,
}: {
  label: string;
  amount: number;
  icon?: ReactNode;
  tone?: "default" | "critical" | "amber";
  negative?: boolean;
}) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "amber" ? "text-safety-amber" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between text-base">
      <span className={`flex items-center gap-1.5 ${toneClass}`}>
        {icon}
        {label}
      </span>
      <span className={toneClass}>
        {negative && "-"}
        <Money amount={amount} />
      </span>
    </div>
  );
}

// Shown whenever the sale has a customer attached — same tier/points/SAR-equivalent PosCheckout's
// own customer card shows, so the customer sees their own loyalty status without asking the cashier.
function CustomerBadge({ snapshot }: { snapshot: CustomerDisplaySnapshot }) {
  if (!snapshot.customerName) return null;
  return (
    <div className="pos-slide-up flex items-center justify-between gap-3 border-b border-black/5 bg-white px-6 py-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
          <User className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{snapshot.customerName}</p>
          {snapshot.customerLoyaltyTier && (
            <p className="text-xs text-muted-foreground">★ {snapshot.customerLoyaltyTier}</p>
          )}
        </div>
      </div>
      {!!snapshot.customerLoyaltyPoints && (
        <div className="text-right">
          <p className="text-sm font-semibold text-brand">
            {snapshot.customerLoyaltyPoints.toLocaleString("en-US")} pts
          </p>
          {snapshot.customerLoyaltyPointsSarValue != null && (
            <p className="text-xs text-muted-foreground">
              ≈ <Money amount={snapshot.customerLoyaltyPointsSarValue} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomerDisplayPage() {
  const { user, hasAccess } = useAuth();
  const canView = hasAccess("/operate/customer-display");
  const { data: terminals } = useTerminals(canView);

  const [terminalId, setTerminalId] = useState<number | null>(() => {
    const stored = localStorage.getItem(TERMINAL_STORAGE_KEY);
    return terminalIdFromUrl() ?? (stored ? Number(stored) : null);
  });
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(IDLE_SNAPSHOT);

  // PosSessionHub rejects the join server-side for a terminal outside the caller's own branch (or
  // if they lack POS/display permission entirely) — surfaced here instead of leaving the screen
  // stuck showing nothing with no explanation of why it never updates.
  const { restricted } = usePosSessionListener(canView ? terminalId : null, setSnapshot);

  function clearPairing() {
    localStorage.removeItem(TERMINAL_STORAGE_KEY);
    window.history.replaceState(null, "", "/operate/customer-display");
    setTerminalId(null);
  }

  // Reset to the idle screen immediately on switching registers, rather than showing the previous
  // till's stale cart until the new one's next push arrives.
  useEffect(() => {
    setSnapshot(IDLE_SNAPSHOT);
  }, [terminalId]);

  // Keeps the URL and localStorage in sync with whatever register is actually paired, whether that
  // came from the ?terminal= key, a bookmarked bare URL, or the picker below — so the address bar
  // always reflects a copyable, terminal-specific link once one is chosen.
  useEffect(() => {
    if (!terminalId) return;
    localStorage.setItem(TERMINAL_STORAGE_KEY, String(terminalId));
    if (terminalIdFromUrl() !== terminalId) {
      window.history.replaceState(null, "", customerDisplayPath(terminalId));
    }
  }, [terminalId]);

  // Same boundary PosSessionHub enforces server-side: a plain cashier only ever pairs a display to
  // their own till (or an unassigned one) — a till assigned to a different cashier is hidden from
  // the picker entirely, not just unselectable, so there's nothing to pick that the hub would then
  // refuse to join. Supervisor+ (the void-transaction authority ceiling) can pair to any till.
  const canViewAnyTerminal = user?.posCeilings.canVoidTransactions ?? false;
  const branchTerminals =
    terminals?.filter((t) => {
      if (user?.branchId && t.branchId !== user.branchId) return false;
      return canViewAnyTerminal || t.assignedCashierId == null || t.assignedCashierId === user?.id;
    }) ?? [];
  const selectedTerminal = terminals?.find((t) => t.id === terminalId);

  if (!canView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center">
        <p className="text-sm text-muted-foreground">
          You don't have access to the Customer Display.
        </p>
      </div>
    );
  }

  if (!terminalId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 text-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-black/5 bg-white px-8 py-10 shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand">
            <MonitorSmartphone className="h-7 w-7" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">Pick a register to mirror</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This tablet will show that till's cart to the customer.
            </p>
          </div>
          <select
            className="w-full rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm"
            defaultValue=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (!id) return;
              localStorage.setItem(TERMINAL_STORAGE_KEY, String(id));
              setTerminalId(id);
            }}
          >
            <option value="" disabled>
              Select a register…
            </option>
            {branchTerminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code}) · {t.branchName}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied", { description: window.location.href });
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-brand"
          >
            <Copy className="h-3.5 w-3.5" /> Copy this page's link
          </button>
        </div>
      </div>
    );
  }

  if (restricted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-critical/10 text-critical">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="font-display text-xl font-semibold text-foreground">This register isn't available to you</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You don't have access to this terminal's display — it may belong to a different branch, or
          you're not paired to it.
        </p>
        <button onClick={clearPairing} className="text-xs font-medium text-brand hover:underline">
          Pick a different register
        </button>
      </div>
    );
  }

  if (snapshot.status === "Approved") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-[oklch(0.22_0.08_285)] via-[oklch(0.18_0.06_285)] to-[oklch(0.12_0.05_285)] px-6 text-center text-white">
        <div className="blueprint-grid-dark pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex flex-col items-center gap-6">
          <span className="pos-pop grid h-28 w-28 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
            <CheckCircle2 className="h-16 w-16" />
          </span>
          <h1 className="pos-slide-up font-display text-5xl font-bold">Thank you!</h1>
          {snapshot.orderNo && (
            <p className="pos-slide-up stagger-1 text-lg text-white/70">Order {snapshot.orderNo}</p>
          )}
          <p className="pos-slide-up stagger-2 font-display text-4xl font-semibold">
            <Money amount={snapshot.total} />
          </p>
        </div>
      </div>
    );
  }

  if (snapshot.lines.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <DisplayHeader branchName={selectedTerminal?.branchName} registerName={selectedTerminal?.name} terminalId={terminalId} />
        <CustomerBadge snapshot={snapshot} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="bp-pulse-dot grid h-20 w-20 place-items-center rounded-full bg-brand/10 text-brand">
            <ShoppingCart className="h-9 w-9" />
          </span>
          <h1 className="font-display text-3xl font-semibold text-foreground">Welcome</h1>
          <p className="text-muted-foreground">Your order will appear here as items are scanned.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <DisplayHeader branchName={selectedTerminal?.branchName} registerName={selectedTerminal?.name} terminalId={terminalId} />
      <CustomerBadge snapshot={snapshot} />

      {snapshot.status === "Processing" && (
        <div className="pos-blink bg-brand px-6 py-2 text-center text-sm font-medium text-brand-foreground">
          Processing payment…
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          {snapshot.lines.map((l, i) => (
            <div
              key={i}
              className={`pos-slide-up stagger-${Math.min(i + 1, 6)} flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-sm`}
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-foreground">{l.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtAmount(l.qty, l.qty % 1 === 0 ? 0 : 2)} {l.uom} × <Money amount={l.unitPrice} />
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-xl font-bold text-foreground">
                <Money amount={l.lineTotal} />
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 border-t border-black/10 bg-white px-6 py-5">
        <SummaryRow label={`Subtotal (${snapshot.lines.length} items)`} amount={snapshot.subtotal} />
        {snapshot.discounts.map((d, i) => (
          <SummaryRow
            key={`d-${i}`}
            label={d.label}
            amount={d.amount}
            negative
            tone="critical"
            icon={<Percent className="h-3.5 w-3.5" />}
          />
        ))}
        {snapshot.fees.map((f, i) => (
          <SummaryRow key={`f-${i}`} label={f.label} amount={f.amount} tone="amber" icon={<Receipt className="h-3.5 w-3.5" />} />
        ))}
        <SummaryRow label="VAT" amount={snapshot.vat} />
        <div className="mt-1.5 flex items-center justify-between border-t border-black/10 pt-3">
          <span className="font-display text-xl font-semibold text-foreground">Total</span>
          <span key={snapshot.total} className="pos-pop font-display text-4xl font-bold text-brand">
            <Money amount={Math.max(0, snapshot.total)} />
          </span>
        </div>
      </div>
    </div>
  );
}
