/** BRD §79.5 — the 7-step Add Stock wizard. Drives the intake store; nothing here is static. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Paperclip, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { useAuth } from "@/lib/api/auth";
import {
  BRANCHES, DAMAGE_CODES, DISPOSITIONS, INTAKE_SOURCES, PRODUCTS, SUPPLIERS,
  blankIntake, blankLine, conversionFactor, convertedQty, costVariance, findProduct,
  intakeTotals, lineNet, lineVat, round2, triggeredRules, useStockIntakeStore, validateIntake,
  type Disposition, type IntakeLine, type IntakeSource, type StockIntake,
} from "@/lib/stock/intake-store";

const STEPS = [
  "Source & Reference",
  "Branch & Receipt",
  "Products & Quantities",
  "Cost, VAT & Totals",
  "Quality & Disposition",
  "Documents & Notes",
  "Review & Approval",
];

const ATTACHMENT_TYPES = [
  "Supplier Delivery Note", "Supplier Invoice", "Purchase Order Copy", "Stock Transfer Note",
  "Inspection Report", "Product Images", "Damage Images", "Opening Balance Sheet",
  "Customer Return Document", "Other Attachment",
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Sel({ value, onChange, options, placeholder = "Select…" }: { value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function money(n: number) {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

export function AddStockWizard({
  open, onOpenChange, initial, presetSource,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: StockIntake | null;
  presetSource?: IntakeSource;
}) {
  const { user } = useAuth();
  const userName = user?.name ?? "System Admin";
  const store = useStockIntakeStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StockIntake>(() => seed());
  const [search, setSearch] = useState("");

  function seed(): StockIntake {
    if (initial) return structuredClone(initial);
    const ids = useStockIntakeStore.getState().nextIds();
    const base = blankIntake(ids.id, ids.grn, userName);
    return presetSource ? { ...base, source: presetSource } : base;
  }

  // Re-seed whenever the dialog is opened for a different record.
  const seedKey = `${open}-${initial?.id ?? "new"}-${presetSource ?? ""}`;
  const [lastKey, setLastKey] = useState(seedKey);
  if (seedKey !== lastKey) {
    setLastKey(seedKey);
    setStep(0);
    setDraft(seed());
  }

  const totals = useMemo(() => intakeTotals(draft), [draft]);
  const errors = useMemo(() => validateIntake(draft), [draft]);
  const rules = useMemo(() => triggeredRules(draft), [draft]);
  const readOnly = draft.status === "Posted";

  function set<K extends keyof StockIntake>(key: K, value: StockIntake[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setLine(key: string, patch: Partial<IntakeLine>) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Keep the reconciliation honest: accepted auto-fills the remainder when the user changes
        // received/damaged/rejected/short, so the line always balances unless edited directly.
        if (patch.acceptedQty === undefined) {
          const conv = convertedQty(next);
          next.acceptedQty = Math.max(0, round2(conv - next.damagedQty - next.rejectedQty - next.shortQty));
        }
        return next;
      }),
    }));
  }
  function addLine(sku: string) {
    if (!sku) return;
    setDraft((d) => ({ ...d, lines: [...d.lines, { ...blankLine(sku), disposition: d.defaultDisposition }] }));
  }

  /* ---- source auto-load (§79.2) ---- */
  function applySourceRef(ref: string) {
    setDraft((d) => {
      const next = { ...d, sourceRef: ref };
      if (d.source === "Purchase Order Receipt") {
        const po = store.purchaseOrders.find((p) => p.id === ref);
        if (po) {
          next.supplier = po.supplier;
          next.branch = po.branch;
          next.lines = po.lines
            .filter((pl) => pl.receivedQty < pl.orderedQty)
            .map((pl) => {
              const remaining = pl.orderedQty - pl.receivedQty;
              const l = blankLine(pl.sku);
              return { ...l, recvUom: pl.uom, recvQty: remaining, acceptedQty: remaining, unitCost: pl.unitCost, orderedQty: pl.orderedQty, remainingQty: remaining };
            });
        }
      }
      if (d.source === "Stock Transfer Receipt") {
        const t = store.transfers.find((x) => x.id === ref);
        if (t) {
          next.branch = t.toBranch;
          next.fromBranch = t.fromBranch;
          next.lines = t.lines.map((tl) => {
            const remaining = tl.dispatchedQty - tl.receivedQty;
            const l = blankLine(tl.sku);
            return { ...l, recvUom: tl.uom, recvQty: remaining, acceptedQty: remaining, dispatchedQty: tl.dispatchedQty };
          });
        }
      }
      if (d.source === "Customer Return Restock") {
        const r = store.returns.find((x) => x.id === ref);
        if (r) {
          next.branch = r.branch;
          next.invoiceNo = r.invoiceNo;
          next.externalRef = r.invoiceNo;
          next.reason = `Approved customer return — ${r.customer}`;
          next.lines = r.lines.map((rl) => {
            const l = blankLine(rl.sku);
            const qty = rl.approvedQty - rl.restockedQty;
            return { ...l, recvUom: rl.uom, recvQty: qty, acceptedQty: qty };
          });
        }
      }
      if (d.source === "Quarantine Release") {
        const q = store.quarantine.find((x) => x.id === ref);
        if (q) {
          next.branch = q.branch;
          const balance = q.qty - q.released;
          const l = blankLine(q.sku);
          next.lines = [{ ...l, recvQty: balance, acceptedQty: balance }];
          next.reason = `Quarantine release — ${q.reason}`;
        }
      }
      return next;
    });
  }

  function persist(status: StockIntake["status"], event: string, note?: string) {
    const record: StockIntake = { ...draft, status };
    store.upsertIntake(record, userName);
    if (status !== "Draft") store.transition(record.id, status, event, userName, note);
    return record;
  }

  function saveDraft() {
    persist("Draft", "STOCK_INTAKE_UPDATED");
    toast.success(`${draft.id} saved as draft`);
    onOpenChange(false);
  }

  function submit() {
    if (errors.length) return toast.error(errors[0]);
    const status = draft.inspectionRequired
      ? "Inspection Required"
      : rules.length
        ? "Pending Approval"
        : "Submitted";
    persist(status, "STOCK_INTAKE_SUBMITTED");
    toast.success(`${draft.id} submitted — status ${status}`);
    onOpenChange(false);
  }

  function postNow() {
    if (errors.length) return toast.error(errors[0]);
    persist("Approved", "STOCK_INTAKE_APPROVED", "Approved from wizard");
    const res = store.postIntake(draft.id, userName);
    toast[res.ok ? "success" : "error"](res.message);
    if (res.ok) onOpenChange(false);
  }

  const filteredProducts = PRODUCTS.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.sku, p.name, p.nameAr, p.category].some((v) => v.toLowerCase().includes(q));
  });

  const sourceRefOptions =
    draft.source === "Purchase Order Receipt" ? store.purchaseOrders.filter((p) => p.status !== "Received").map((p) => p.id)
    : draft.source === "Stock Transfer Receipt" ? store.transfers.filter((t) => !t.status.startsWith("Received")).map((t) => t.id)
    : draft.source === "Customer Return Restock" ? store.returns.filter((r) => !r.restocked).map((r) => r.id)
    : draft.source === "Quarantine Release" ? store.quarantine.filter((q) => q.qty > q.released).map((q) => q.id)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Add Stock · {draft.id}
            <Pill tone="info">{draft.grn}</Pill>
            <Pill tone={draft.status === "Posted" ? "success" : "warning"}>{draft.status}</Pill>
          </DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          <ol className="hidden w-52 shrink-0 space-y-1 overflow-y-auto lg:block">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  onClick={() => setStep(i)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${i === step ? "bg-brand/10 font-semibold text-brand" : "text-muted-foreground hover:bg-black/5"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${i < step ? "bg-success text-white" : i === step ? "bg-brand text-brand-foreground" : "bg-black/10"}`}>
                    {i < step ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="truncate">{s}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Stock Intake Source">
                  <Sel value={draft.source} options={INTAKE_SOURCES} onChange={(v) => setDraft((d) => ({ ...d, source: v as IntakeSource, sourceRef: "", lines: [] }))} />
                </Field>
                {sourceRefOptions.length > 0 && (
                  <Field
                    label={
                      draft.source === "Purchase Order Receipt" ? "Purchase Order"
                      : draft.source === "Stock Transfer Receipt" ? "Stock Transfer"
                      : draft.source === "Customer Return Restock" ? "Customer Return"
                      : "Quarantine Record"
                    }
                    hint="Selecting a reference loads its outstanding lines automatically."
                  >
                    <Sel value={draft.sourceRef} options={sourceRefOptions} onChange={applySourceRef} />
                  </Field>
                )}
                {sourceRefOptions.length === 0 && (
                  <Field label={draft.source === "Opening Stock" ? "Implementation / Opening Reference" : "Source Reference"}>
                    <Input value={draft.sourceRef} onChange={(e) => set("sourceRef", e.target.value)} placeholder="e.g. KHB-GOLIVE-001" />
                  </Field>
                )}
                <Field label="External Reference Number">
                  <Input value={draft.externalRef} onChange={(e) => set("externalRef", e.target.value)} />
                </Field>
                <Field label={draft.source === "Opening Stock" ? "Opening Stock Date" : "Source Date"}>
                  <Input type="date" value={draft.sourceDate} onChange={(e) => set("sourceDate", e.target.value)} />
                </Field>
                {draft.source === "Purchase Order Receipt" && (
                  <Field label="Supplier"><Input value={draft.supplier} readOnly /></Field>
                )}
                {draft.source === "Stock Transfer Receipt" && (
                  <Field label="Source Branch"><Input value={draft.fromBranch ?? ""} readOnly /></Field>
                )}
                {draft.source === "Customer Return Restock" && (
                  <Field label="Original Invoice"><Input value={draft.invoiceNo} readOnly /></Field>
                )}
                {(draft.source === "Manual Stock Addition" || draft.source === "Opening Stock" || draft.source === "Stock Count Surplus") && (
                  <div className="sm:col-span-2">
                    <Field label="Reason (mandatory)">
                      <Textarea rows={2} value={draft.reason} onChange={(e) => set("reason", e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Receiving Branch"><Sel value={draft.branch} options={BRANCHES} onChange={(v) => set("branch", v)} /></Field>
                <Field label="Stock Location Reference"><Input value={draft.locationRef} onChange={(e) => set("locationRef", e.target.value)} placeholder="Receiving Bay 2" /></Field>
                <Field label="Receipt Date"><Input type="date" value={draft.receiptDate} onChange={(e) => set("receiptDate", e.target.value)} /></Field>
                <Field label="Receipt Time"><Input type="time" value={draft.receiptTime} onChange={(e) => set("receiptTime", e.target.value)} /></Field>
                <Field label="Supplier"><Sel value={draft.supplier} options={SUPPLIERS} onChange={(v) => set("supplier", v)} placeholder="Not applicable" /></Field>
                <Field label="Supplier Delivery Note"><Input value={draft.deliveryNote} onChange={(e) => set("deliveryNote", e.target.value)} /></Field>
                <Field label="Supplier Invoice Number"><Input value={draft.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} /></Field>
                <Field label="Received By"><Input value={draft.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} /></Field>
                <Field label="Default Stock Disposition">
                  <Sel value={draft.defaultDisposition} options={DISPOSITIONS} onChange={(v) => set("defaultDisposition", v as Disposition)} />
                </Field>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox id="insp" checked={draft.inspectionRequired} onCheckedChange={(c) => set("inspectionRequired", Boolean(c))} />
                  <Label htmlFor="insp" className="text-sm">Inspection required before stock becomes available</Label>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Notes"><Textarea rows={2} value={draft.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} /></Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-9 max-w-xs" placeholder="Search SKU, barcode, product, Arabic name, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Sel value="" placeholder="Add Product…" options={filteredProducts.map((p) => `${p.sku} — ${p.name}`)} onChange={(v) => addLine(v.split(" — ")[0])} />
                  <Button variant="outline" size="sm" onClick={() => toast.info("Barcode scanner ready — scan a product barcode to add its line.")}>
                    <ScanLine className="mr-1 h-3.5 w-3.5" /> Scan Barcode
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraft((d) => (d.lines.length ? { ...d, lines: [...d.lines, { ...d.lines[d.lines.length - 1], key: Math.random().toString(36).slice(2, 10) }] } : d))}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy Previous Line
                  </Button>
                </div>

                {draft.lines.length === 0 && (
                  <p className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-muted-foreground">
                    No lines yet. Pick a source reference on step 1 to auto-load products, or add a product above.
                  </p>
                )}

                <div className="space-y-3">
                  {draft.lines.map((l, idx) => {
                    const p = findProduct(l.sku);
                    const factor = conversionFactor(l.sku, l.recvUom);
                    return (
                      <div key={l.key} className="rounded-xl border border-black/10 bg-white p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{idx + 1}. {p?.name ?? l.sku} <span className="font-mono text-xs text-muted-foreground">{l.sku}</span></p>
                            <p className="truncate text-[11px] text-muted-foreground" dir="rtl">{p?.nameAr} · {p?.category}</p>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {l.orderedQty !== undefined && <Pill tone="info">Ordered {l.orderedQty} · Remaining {l.remainingQty}</Pill>}
                            {l.dispatchedQty !== undefined && <Pill tone="info">Dispatched {l.dispatchedQty}</Pill>}
                            <Button variant="ghost" size="icon" onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}>
                              <Trash2 className="h-4 w-4 text-critical" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          <Field label="Receiving UOM"><Sel value={l.recvUom} options={Object.keys(p?.uoms ?? {})} onChange={(v) => setLine(l.key, { recvUom: v })} /></Field>
                          <Field label="Received Qty"><Input type="number" min={0} value={l.recvQty} onChange={(e) => setLine(l.key, { recvQty: Number(e.target.value) })} /></Field>
                          <Field label="Conversion"><Input readOnly value={`1 ${l.recvUom || "—"} = ${factor} ${p?.stockUom ?? ""}`} /></Field>
                          <Field label={`Converted (${p?.stockUom ?? ""})`}><Input readOnly value={convertedQty(l)} /></Field>
                          <Field label="Accepted"><Input type="number" min={0} value={l.acceptedQty} onChange={(e) => setLine(l.key, { acceptedQty: Number(e.target.value) })} /></Field>
                          <Field label="Damaged"><Input type="number" min={0} value={l.damagedQty} onChange={(e) => setLine(l.key, { damagedQty: Number(e.target.value) })} /></Field>
                          <Field label="Rejected"><Input type="number" min={0} value={l.rejectedQty} onChange={(e) => setLine(l.key, { rejectedQty: Number(e.target.value) })} /></Field>
                          <Field label="Short"><Input type="number" min={0} value={l.shortQty} onChange={(e) => setLine(l.key, { shortQty: Number(e.target.value) })} /></Field>
                          <Field label="Free / Bonus"><Input type="number" min={0} value={l.freeQty} onChange={(e) => setLine(l.key, { freeQty: Number(e.target.value) })} /></Field>
                          <Field label="Batch Number"><Input value={l.batchNo} onChange={(e) => setLine(l.key, { batchNo: e.target.value, acceptedQty: l.acceptedQty })} /></Field>
                          <Field label="Manufacturing Date"><Input type="date" value={l.mfgDate} onChange={(e) => setLine(l.key, { mfgDate: e.target.value, acceptedQty: l.acceptedQty })} /></Field>
                          <Field label="Expiry / Validity"><Input type="date" value={l.expiryDate} onChange={(e) => setLine(l.key, { expiryDate: e.target.value, acceptedQty: l.acceptedQty })} /></Field>
                          {p?.serialTracked && (
                            <div className="sm:col-span-3 lg:col-span-6">
                              <Field label="Serial Numbers (one per accepted unit)" hint="Comma or newline separated. Duplicates are blocked.">
                                <Textarea rows={2} value={l.serials} onChange={(e) => setLine(l.key, { serials: e.target.value, acceptedQty: l.acceptedQty })} />
                              </Field>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {draft.lines.map((l) => {
                  const variance = costVariance(l);
                  return (
                    <div key={l.key} className="rounded-xl border border-black/10 p-3">
                      <p className="mb-2 text-sm font-semibold">{l.sku}</p>
                      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <Field label="Unit Cost (Ex-VAT)"><Input type="number" min={0} step="0.01" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: Number(e.target.value), acceptedQty: l.acceptedQty })} /></Field>
                        <Field label="Discount %"><Input type="number" min={0} max={100} value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: Number(e.target.value), acceptedQty: l.acceptedQty })} /></Field>
                        <Field label="VAT Rate %"><Input type="number" min={0} value={l.vatRate} onChange={(e) => setLine(l.key, { vatRate: Number(e.target.value), acceptedQty: l.acceptedQty })} /></Field>
                        <Field label="Net Line Total"><Input readOnly value={money(lineNet(l))} /></Field>
                        <Field label="VAT Amount"><Input readOnly value={money(lineVat(l))} /></Field>
                        <Field label="Last Purchase Cost"><Input readOnly value={money(findProduct(l.sku)?.unitCost ?? 0)} /></Field>
                      </div>
                      {variance !== null && Math.abs(variance) > 10 && (
                        <p className="mt-2 flex items-center gap-1.5 rounded-md bg-warning/15 px-2 py-1 text-[12px] text-[oklch(0.4_0.13_70)]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Purchase cost is {Math.abs(variance)}% {variance > 0 ? "higher" : "lower"} than the last receipt. Approval is required.
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="grid gap-2 rounded-xl border border-black/10 bg-canvas p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <p>Gross Receipt Value <b className="block">{money(totals.net)}</b></p>
                  <p>VAT <b className="block">{money(totals.vat)}</b></p>
                  <p>Total Receipt Value <b className="block">{money(totals.total)}</b></p>
                  <p>Accepted Stock Value <b className="block">{money(totals.acceptedValue)}</b></p>
                  <p>Quarantine Stock Value <b className="block">{money(totals.quarantineValue)}</b></p>
                  <p>Rejected Stock Value <b className="block">{money(totals.rejectedValue)}</b></p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {draft.lines.map((l) => (
                  <div key={l.key} className="grid gap-2 rounded-xl border border-black/10 p-3 sm:grid-cols-3 lg:grid-cols-4">
                    <p className="text-sm font-semibold lg:col-span-4">{l.sku} — accepted {l.acceptedQty} · damaged {l.damagedQty} · rejected {l.rejectedQty}</p>
                    <Field label="Stock Disposition"><Sel value={l.disposition} options={DISPOSITIONS} onChange={(v) => setLine(l.key, { disposition: v as Disposition, acceptedQty: l.acceptedQty })} /></Field>
                    <Field label="Damage Code"><Sel value={l.damageCode} options={DAMAGE_CODES} onChange={(v) => setLine(l.key, { damageCode: v, acceptedQty: l.acceptedQty })} placeholder="None" /></Field>
                    <div className="sm:col-span-1 lg:col-span-2">
                      <Field label="Inspection / Rejection Notes"><Input value={l.notes} onChange={(e) => setLine(l.key, { notes: e.target.value, acceptedQty: l.acceptedQty })} /></Field>
                    </div>
                  </div>
                ))}
                <p className="text-[12px] text-muted-foreground">
                  Accepted sellable quantity increases available stock. Damaged and quarantine quantities increase on-hand and quarantine only. Rejected quantity does not enter stock. Supplier Return Hold is blocked pending RTS.
                </p>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <Field label="Attach Document">
                  <Sel value="" placeholder="Add attachment…" options={ATTACHMENT_TYPES} onChange={(v) => set("attachments", [...draft.attachments, `${v} — ${draft.id}.pdf`])} />
                </Field>
                <ul className="space-y-1">
                  {draft.attachments.map((a) => (
                    <li key={a} className="flex items-center justify-between rounded-md border border-black/10 px-2 py-1.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a}</span></span>
                      <Button variant="ghost" size="icon" onClick={() => set("attachments", draft.attachments.filter((x) => x !== a))}><Trash2 className="h-4 w-4 text-critical" /></Button>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Internal Notes"><Textarea rows={3} value={draft.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} /></Field>
                  <Field label="Supplier Notes"><Textarea rows={3} value={draft.supplierNotes} onChange={(e) => set("supplierNotes", e.target.value)} /></Field>
                  <Field label="Approval Comments"><Textarea rows={2} value={draft.approvalComments} onChange={(e) => set("approvalComments", e.target.value)} /></Field>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 rounded-xl border border-black/10 bg-canvas p-3 sm:grid-cols-2 lg:grid-cols-3">
                  <p>Source <b className="block">{draft.source}</b></p>
                  <p>Reference <b className="block">{draft.sourceRef || "—"}</b></p>
                  <p>Receiving Branch <b className="block">{draft.branch}</b></p>
                  <p>Supplier <b className="block">{draft.supplier || "—"}</b></p>
                  <p>Receipt Date <b className="block">{draft.receiptDate} {draft.receiptTime}</b></p>
                  <p>Item Count <b className="block">{draft.lines.length}</b></p>
                  <p>Received <b className="block">{totals.received}</b></p>
                  <p>Accepted <b className="block">{totals.accepted}</b></p>
                  <p>Quarantine <b className="block">{totals.quarantine}</b></p>
                  <p>Rejected <b className="block">{totals.rejected}</b></p>
                  <p>Receipt Value <b className="block">{money(totals.total)}</b></p>
                  <p>Approver <b className="block">{draft.approvedBy || (rules.length ? "Required" : "Not required")}</b></p>
                </div>

                <div className="rounded-xl border border-black/10 p-3">
                  <p className="mb-1 font-semibold">Posting impact</p>
                  <ul className="list-inside list-disc text-[13px] text-muted-foreground">
                    <li>Available stock increase: {draft.inspectionRequired ? 0 : totals.accepted - totals.quarantine + totals.damaged} units</li>
                    <li>Quarantine increase: {totals.quarantine} units</li>
                    <li>Rejected (no stock impact): {totals.rejected} units</li>
                    {draft.source === "Purchase Order Receipt" && <li>Purchase order {draft.sourceRef} will be updated to Partially Received / Received</li>}
                    {draft.source === "Stock Transfer Receipt" && <li>Transfer {draft.sourceRef} will be marked Received{totals.damaged ? " with Damage" : ""}</li>}
                    <li>{draft.lines.length} stock movement(s) will be generated</li>
                  </ul>
                </div>

                {rules.length > 0 && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
                    <p className="mb-1 font-semibold text-[oklch(0.4_0.13_70)]">Approval rules triggered</p>
                    <ul className="list-inside list-disc text-[13px]">
                      {rules.map((r) => <li key={r.name}>{r.name} — {r.action}</li>)}
                    </ul>
                  </div>
                )}

                {errors.length > 0 && (
                  <div className="rounded-xl border border-critical/40 bg-critical/10 p-3">
                    <p className="mb-1 font-semibold text-critical">Blocking validations</p>
                    <ul className="list-inside list-disc text-[13px]">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            <Button variant="outline" size="sm" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>Next</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="outline" size="sm" disabled={readOnly} onClick={saveDraft}><Plus className="mr-1 h-3.5 w-3.5" /> Save Draft</Button>
            <Button variant="outline" size="sm" disabled={readOnly} onClick={submit}>Submit for Approval</Button>
            <Button size="sm" disabled={readOnly || errors.length > 0} onClick={postNow}>Approve &amp; Post Stock</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}