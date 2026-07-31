/**
 * BRD §79 — Inventory & Stock workspace: live stock balances plus the full Add Stock intake
 * lifecycle (draft → approval → posting → movements → quarantine).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, CheckCircle2, Download, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { cols } from "@/lib/buildpos/grid";
import { useAuth } from "@/lib/api/auth";
import { AddStockWizard } from "@/components/buildpos/stock/AddStockWizard";
import {
  BRANCHES, EMPTY_STOCK, PRODUCTS, findProduct, intakeTotals, onHand,
  useStockIntakeStore, type IntakeSource, type StockIntake,
} from "@/lib/stock/intake-store";
import type { Severity } from "@/lib/buildpos/format";

const TABS = ["Stock Overview", "Add Stock", "Intake Register", "Stock Movements", "Quarantine", "Branch Availability", "Audit Log"] as const;

function statusTone(s: string): Severity {
  if (s === "Posted") return "success";
  if (s === "Rejected" || s === "Cancelled") return "critical";
  if (s === "Draft") return "muted";
  if (s === "Approved" || s === "Submitted") return "info";
  return "warning";
}

function money(n: number) {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function fmtTs(ts: number) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Severity }) {
  const ring: Record<Severity, string> = {
    success: "bg-success/10 text-success", warning: "bg-warning/15 text-[oklch(0.45_0.13_70)]",
    critical: "bg-critical/10 text-critical", info: "bg-brand/10 text-brand", muted: "bg-black/5 text-foreground/70",
  };
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] ${ring[tone]}`}>{sub}</span>
    </div>
  );
}

export function StockIntakePage() {
  const { user } = useAuth();
  const userName = user?.name ?? "System Admin";
  const store = useStockIntakeStore();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Stock Overview");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<StockIntake | null>(null);
  const [preset, setPreset] = useState<IntakeSource | null>(null);
  const [branch, setBranch] = useState<string>("All Branches");
  const [q, setQ] = useState("");

  const balances = store.balances;

  const rows = useMemo(() => {
    const list: { branch: string; sku: string; stock: typeof EMPTY_STOCK }[] = [];
    for (const b of BRANCHES) {
      for (const p of PRODUCTS) {
        const s = balances[`${b}|${p.sku}`];
        if (s) list.push({ branch: b, sku: p.sku, stock: s });
      }
    }
    return list.filter((r) => (branch === "All Branches" || r.branch === branch)
      && (!q.trim() || `${r.sku} ${findProduct(r.sku)?.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  }, [balances, branch, q]);

  const totals = useMemo(() => {
    let available = 0, reserved = 0, quarantine = 0, hold = 0, value = 0, low = 0, out = 0;
    for (const r of rows) {
      const p = findProduct(r.sku);
      available += r.stock.available; reserved += r.stock.reserved; quarantine += r.stock.quarantine;
      hold += r.stock.inspectionHold + r.stock.supplierReturnHold;
      value += onHand(r.stock) * (p?.unitCost ?? 0);
      if (r.stock.available <= 0) out += 1;
      else if (p && r.stock.available <= p.lowStockLevel) low += 1;
    }
    return { available, reserved, quarantine, hold, value, low, out };
  }, [rows]);

  const pendingIntakes = store.intakes.filter((i) => i.status !== "Posted" && i.status !== "Cancelled" && i.status !== "Rejected");
  const postedToday = store.intakes.filter((i) => i.postedAt && Date.now() - i.postedAt < 86400000);

  function openNew() { setEditing(null); setPreset(null); setWizardOpen(true); }
  function openEdit(i: StockIntake) { setEditing(i); setPreset(null); setWizardOpen(true); }

  function post(i: StockIntake) {
    const res = store.postIntake(i.id, userName);
    toast[res.ok ? "success" : "error"](res.message);
  }

  function exportCsv(name: string, columns: string[], data: (string | number)[][]) {
    const csv = [columns, ...data].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${name}.csv exported`);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">Inventory &amp; Stock</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live branch balances, goods receipt (GRN) intake, quarantine control and full movement history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success("Stock balances refreshed")}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" onClick={openNew}><Plus className="mr-1 h-3.5 w-3.5" /> Add Stock</Button>
        </div>
      </header>

      <div className={`ui-card-grid ${cols(4)}`}>
        <Kpi label="Available Stock" value={totals.available.toLocaleString()} sub="Sellable units" tone="success" />
        <Kpi label="Reserved" value={totals.reserved.toLocaleString()} sub="Orders & delivery" tone="info" />
        <Kpi label="Quarantine" value={totals.quarantine.toLocaleString()} sub="Damage / recall" tone="warning" />
        <Kpi label="Inspection & RTS Hold" value={totals.hold.toLocaleString()} sub="Not sellable" tone="warning" />
        <Kpi label="Stock Value" value={money(totals.value)} sub="At cost" tone="info" />
        <Kpi label="Low Stock SKUs" value={String(totals.low)} sub="At or below reorder" tone="critical" />
        <Kpi label="Out of Stock" value={String(totals.out)} sub="Zero available" tone="critical" />
        <Kpi label="Intakes Pending" value={String(pendingIntakes.length)} sub={`${postedToday.length} posted today`} tone={pendingIntakes.length ? "warning" : "success"} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          {TABS.map((t) => <TabsTrigger key={t} value={t} className="text-xs">{t}</TabsTrigger>)}
        </TabsList>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input className="h-9 max-w-xs" placeholder="Search SKU or product…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {["All Branches", ...BRANCHES].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>

        <TabsContent value="Stock Overview" className="mt-4">
          <SectionCard
            title="Branch Stock Balances"
            desc={`${rows.length} SKU/branch positions`}
            action={<Button variant="outline" size="sm" onClick={() => exportCsv("stock-balances", ["Branch", "SKU", "Product", "Available", "Reserved", "Quarantine", "Hold", "On Hand"], rows.map((r) => [r.branch, r.sku, findProduct(r.sku)?.name ?? "", r.stock.available, r.stock.reserved, r.stock.quarantine, r.stock.inspectionHold + r.stock.supplierReturnHold, onHand(r.stock)]))}><Download className="mr-1 h-3.5 w-3.5" /> Export</Button>}
          >
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Branch", "SKU", "Product", "UOM", "Available", "Reserved", "Quarantine", "Hold", "On Hand", "Status"].map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const p = findProduct(r.sku);
                    const status = r.stock.available <= 0 ? "Out of Stock" : p && r.stock.available <= p.lowStockLevel ? "Low Stock" : "Healthy";
                    return (
                      <TableRow key={`${r.branch}-${r.sku}`}>
                        <TableCell className="whitespace-nowrap">{r.branch}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell className="whitespace-nowrap">{p?.name}</TableCell>
                        <TableCell>{p?.stockUom}</TableCell>
                        <TableCell>{r.stock.available}</TableCell>
                        <TableCell>{r.stock.reserved}</TableCell>
                        <TableCell>{r.stock.quarantine}</TableCell>
                        <TableCell>{r.stock.inspectionHold + r.stock.supplierReturnHold}</TableCell>
                        <TableCell>{onHand(r.stock)}</TableCell>
                        <TableCell><Pill tone={status === "Healthy" ? "success" : status === "Low Stock" ? "warning" : "critical"}>{status}</Pill></TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">No stock positions match this filter.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Add Stock" className="mt-4">
          <SectionCard title="Add Stock" desc="Start a goods receipt from any authorised source. Every intake generates a GRN, stock movements and an audit trail.">
            <div className={`ui-tile-grid ${cols(3)}`}>
              {(["Purchase Order Receipt", "Stock Transfer Receipt", "Customer Return Restock", "Quarantine Release", "Manual Stock Addition", "Opening Stock"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setEditing(null); setWizardOpen(true); setPreset(s); }}
                  className="rounded-2xl border border-black/10 bg-white p-4 text-left transition hover:border-brand/40 hover:shadow-md"
                >
                  <Boxes className="mb-2 h-5 w-5 text-brand" />
                  <p className="text-sm font-semibold">{s}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s === "Purchase Order Receipt" ? `${store.purchaseOrders.filter((p) => p.status !== "Received").length} open purchase orders`
                      : s === "Stock Transfer Receipt" ? `${store.transfers.filter((t) => !t.status.startsWith("Received")).length} transfers awaiting receipt`
                      : s === "Customer Return Restock" ? `${store.returns.filter((r) => !r.restocked).length} approved returns to restock`
                      : s === "Quarantine Release" ? `${store.quarantine.filter((x) => x.qty > x.released).length} quarantine records`
                      : s === "Manual Stock Addition" ? "Reason and approval required"
                      : "Go-live opening balances"}
                  </p>
                </button>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Intake Register" className="mt-4">
          <SectionCard title="Stock Intake Register" desc={`${store.intakes.length} intakes`}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Intake ID", "GRN", "Source", "Reference", "Branch", "Supplier", "Received", "Accepted", "Value", "Status", "Actions"].map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.intakes.map((i) => {
                    const t = intakeTotals(i);
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.id}</TableCell>
                        <TableCell className="font-mono text-xs">{i.grn}</TableCell>
                        <TableCell className="whitespace-nowrap">{i.source}</TableCell>
                        <TableCell className="whitespace-nowrap">{i.sourceRef || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{i.branch}</TableCell>
                        <TableCell className="whitespace-nowrap">{i.supplier || "—"}</TableCell>
                        <TableCell>{t.received}</TableCell>
                        <TableCell>{t.accepted}</TableCell>
                        <TableCell className="whitespace-nowrap">{money(t.total)}</TableCell>
                        <TableCell><Pill tone={statusTone(i.status)}>{i.status}</Pill></TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(i)}>{i.status === "Posted" ? "View" : "Open"}</Button>
                          {i.status !== "Posted" && i.status !== "Cancelled" && (
                            <Button variant="ghost" size="sm" onClick={() => post(i)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Post</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Stock Movements" className="mt-4">
          <SectionCard title="Stock Movements" desc={`${store.movements.length} posted movements`}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Movement", "Date", "Type", "SKU", "Branch", "Qty In", "Available Δ", "Quarantine Δ", "Value", "Source", "User"].map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtTs(m.ts)}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.type}</TableCell>
                      <TableCell className="font-mono text-xs">{m.sku}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.branch}</TableCell>
                      <TableCell>+{m.qty} {m.stockUom}</TableCell>
                      <TableCell>{m.availableChange >= 0 ? "+" : ""}{m.availableChange}</TableCell>
                      <TableCell>{m.quarantineChange >= 0 ? "+" : ""}{m.quarantineChange}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(m.totalValue)}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.sourceRecord} {m.sourceRef}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.createdBy}</TableCell>
                    </TableRow>
                  ))}
                  {store.movements.length === 0 && <TableRow><TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">Post an intake to generate stock movements.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Quarantine" className="mt-4">
          <SectionCard title="Quarantine & Holds" desc="Damaged, rejected and inspection-held stock awaiting disposition.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Record", "SKU", "Product", "Branch", "Qty", "Released", "Balance", "Reason", "Source", "Action"].map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.quarantine.map((qr) => (
                    <TableRow key={qr.id}>
                      <TableCell className="font-mono text-xs">{qr.id}</TableCell>
                      <TableCell className="font-mono text-xs">{qr.sku}</TableCell>
                      <TableCell className="whitespace-nowrap">{findProduct(qr.sku)?.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{qr.branch}</TableCell>
                      <TableCell>{qr.qty}</TableCell>
                      <TableCell>{qr.released}</TableCell>
                      <TableCell>{qr.qty - qr.released}</TableCell>
                      <TableCell className="whitespace-nowrap">{qr.reason}</TableCell>
                      <TableCell className="whitespace-nowrap">{qr.sourceRef}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" disabled={qr.qty - qr.released <= 0} onClick={() => { setEditing(null); setPreset("Quarantine Release"); setWizardOpen(true); }}>
                          <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Release
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {store.quarantine.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Nothing in quarantine.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Branch Availability" className="mt-4">
          <SectionCard title="Branch Availability Matrix" desc="Available (sellable) quantity per SKU across every branch.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow><TableHead className="whitespace-nowrap">SKU / Product</TableHead>{BRANCHES.map((b) => <TableHead key={b} className="whitespace-nowrap">{b}</TableHead>)}<TableHead>Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {PRODUCTS.filter((p) => !q.trim() || `${p.sku} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase())).map((p) => {
                    const per = BRANCHES.map((b) => (balances[`${b}|${p.sku}`] ?? EMPTY_STOCK).available);
                    return (
                      <TableRow key={p.sku}>
                        <TableCell className="whitespace-nowrap"><span className="font-mono text-xs">{p.sku}</span> · {p.name}</TableCell>
                        {per.map((v, i) => <TableCell key={BRANCHES[i]} className={v <= 0 ? "text-critical" : v <= p.lowStockLevel ? "text-[oklch(0.45_0.13_70)]" : ""}>{v}</TableCell>)}
                        <TableCell className="font-semibold">{per.reduce((a, b) => a + b, 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Audit Log" className="mt-4">
          <SectionCard title="Stock Intake Audit Trail" desc="Every status change captured against its intake.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["When", "Intake", "Event", "User", "Note"].map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.intakes.flatMap((i) => i.history.map((h) => ({ ...h, id: i.id })))
                    .sort((a, b) => b.ts - a.ts)
                    .map((h, idx) => (
                      <TableRow key={`${h.id}-${h.ts}-${idx}`}>
                        <TableCell className="whitespace-nowrap">{fmtTs(h.ts)}</TableCell>
                        <TableCell className="font-mono text-xs">{h.id}</TableCell>
                        <TableCell className="whitespace-nowrap">{h.event}</TableCell>
                        <TableCell className="whitespace-nowrap">{h.user}</TableCell>
                        <TableCell>{h.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <AddStockWizard open={wizardOpen} onOpenChange={setWizardOpen} initial={editing} presetSource={preset ?? undefined} />
    </div>
  );
}