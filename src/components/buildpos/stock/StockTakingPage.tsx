import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Eye, EyeOff, ScanLine, Send } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect, MultiSearchSelect } from "@/components/buildpos/SearchSelect";
import { BRANCH_LIST, ROLES, activeRoles, useApprovalStore, userName, type Role } from "@/lib/approvals/store";
import { CATEGORIES } from "@/lib/rules/registry";
import {
  COUNT_TYPES, NEGATIVE_REASONS, POSITIVE_REASONS, SCOPES, SESSION_STATUSES, STOCK_TYPES, ZERO_REASON,
  sessionProgress, useStockTakeStore, variance, variancePct, type StockTakeSession,
} from "@/lib/stock/stock-take-store";
import { useAuditStore } from "@/lib/store/audit";
import type { Severity } from "@/lib/buildpos/format";

const opt = (v: string) => ({ value: v, label: v });
const int = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function statusTone(s: string): Severity {
  if (s === "Posted" || s === "Approved") return "success";
  if (s === "Rejected" || s === "Cancelled") return "critical";
  if (s === "Recount Required" || s === "Pending Checker" || s === "Submitted") return "warning";
  if (s === "In Progress") return "info";
  return "muted";
}

export function StockTakingPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <SessionDetail id={openId} onBack={() => setOpenId(null)} /> : <SessionsList onOpen={setOpenId} />;
}

// ————————————————————————— Sessions list —————————————————————————

function SessionsList({ onOpen }: { onOpen: (id: string) => void }) {
  const sessions = useStockTakeStore((s) => s.sessions);
  const adjustments = useStockTakeStore((s) => s.adjustments);
  const createSession = useStockTakeStore((s) => s.createSession);
  const startSession = useStockTakeStore((s) => s.startSession);
  const cancelSession = useStockTakeStore((s) => s.cancelSession);
  const { users, assignments, currentUserId } = useApprovalStore();
  const auditEvents = useAuditStore((s) => s.events).filter((e) => e.event.startsWith("STOCK_TAKE"));

  const [branch, setBranch] = useState("");
  const [countType, setCountType] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState("");
  const [counter, setCounter] = useState("");
  const [create, setCreate] = useState(false);

  const filtered = useMemo(
    () =>
      sessions
        .filter((s) => !branch || s.branch === branch)
        .filter((s) => !countType || s.countType === countType)
        .filter((s) => !scope || s.scope === scope)
        .filter((s) => !status || s.status === status)
        .filter((s) => !counter || s.counterIds.includes(counter)),
    [sessions, branch, countType, scope, status, counter]
  );

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const totals = sessions.reduce(
    (acc, s) => {
      const p = sessionProgress(s);
      acc.varianceSkus += p.varianceSkus;
      acc.positive += p.positive;
      acc.negative += p.negative;
      acc.countedToday += s.lines.filter((l) => (l.lastCountedAt ?? 0) > Date.now() - 86_400_000).length;
      return acc;
    },
    { varianceSkus: 0, positive: 0, negative: 0, countedToday: 0 }
  );

  return (
    <div className="space-y-4">
      <PageHeader
        group="Products & Stock"
        title="Stock Taking"
        desc="Physical counting against system quantity — separate from Add Stock and Stock Adjustments. Blind counts hide system quantity until submission, and approved variance posts one controlled adjustment."
        primary="Create stock take"
        onPrimary={() => setCreate(true)}
      />
      <KpiGrid
        scope="stock-take"
        items={[
          { label: "Active Sessions", value: sessions.filter((s) => s.status === "In Progress").length, tone: "info" },
          { label: "Pending Approval", value: sessions.filter((s) => s.status === "Pending Checker").length, tone: "warning" },
          { label: "Recount Required", value: sessions.filter((s) => s.status === "Recount Required").length, tone: "warning" },
          { label: "Completed This Month", value: sessions.filter((s) => (s.status === "Posted" || s.status === "Approved") && s.updatedAt >= monthStart).length, tone: "success" },
          { label: "SKUs Counted Today", value: int(totals.countedToday) },
          { label: "Variance SKUs", value: totals.varianceSkus, tone: "warning" },
          { label: "Positive Variances", value: totals.positive, tone: "info" },
          { label: "Negative Variances", value: totals.negative, tone: "critical" },
        ]}
      />

      <Tabs defaultValue="sessions">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sessions">Stock Take Sessions</TabsTrigger>
          <TabsTrigger value="active">Active Counts</TabsTrigger>
          <TabsTrigger value="variance">Variance Review</TabsTrigger>
          <TabsTrigger value="recount">Recount Requests</TabsTrigger>
          <TabsTrigger value="completed">Completed Sessions</TabsTrigger>
          <TabsTrigger value="history">Stock Take History</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-4">
          <SectionCard
            title="Sessions"
            desc="Only counting-relevant columns — no supplier, purchase order, invoice, payment or delivery fields."
            action={
              <div className="flex flex-wrap gap-2">
                <SearchSelect className="w-48" options={[{ value: "", label: "All branches" }, ...BRANCH_LIST.map(opt)]} value={branch} onChange={setBranch} placeholder="Branch" />
                <SearchSelect className="w-40" options={[{ value: "", label: "All count types" }, ...COUNT_TYPES.map(opt)]} value={countType} onChange={setCountType} placeholder="Count Type" />
                <SearchSelect className="w-44" options={[{ value: "", label: "All scopes" }, ...SCOPES.map(opt)]} value={scope} onChange={setScope} placeholder="Scope" />
                <SearchSelect className="w-44" options={[{ value: "", label: "All statuses" }, ...SESSION_STATUSES.map(opt)]} value={status} onChange={setStatus} placeholder="Status" />
                <SearchSelect className="w-48" options={[{ value: "", label: "Any counter" }, ...users.map((u) => ({ value: u.id, label: u.name }))]} value={counter} onChange={setCounter} placeholder="Assigned Counter" />
              </div>
            }
          >
            <SessionTable sessions={filtered} onOpen={onOpen} onStart={startSession} onCancel={(id) => cancelSession(id, "Cancelled from session list", userName(users, currentUserId))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <SectionCard title="Active counts" desc="Sessions currently being counted on the floor.">
            <SessionTable sessions={sessions.filter((s) => s.status === "In Progress" || s.status === "Draft" || s.status === "Scheduled")} onOpen={onOpen} onStart={startSession} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="variance" className="mt-4">
          <SectionCard title="Variance review queue" desc="Sessions whose variance is waiting on a checker.">
            <SessionTable sessions={sessions.filter((s) => s.status === "Pending Checker" || s.status === "Submitted")} onOpen={onOpen} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="recount" className="mt-4">
          <SectionCard title="Recount requests" desc="Lines above tolerance that must be counted again before approval.">
            <SessionTable sessions={sessions.filter((s) => s.status === "Recount Required")} onOpen={onOpen} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <SectionCard title="Completed sessions" desc="Approved and posted sessions — posted sessions can no longer be edited.">
            <SessionTable sessions={sessions.filter((s) => s.status === "Posted" || s.status === "Approved" || s.status === "Rejected" || s.status === "Cancelled")} onOpen={onOpen} />
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Generated stock adjustments</p>
              <div className="ui-table-scroll">
                <Table>
                  <TableHeader><TableRow>{["Adjustment ID", "Source Session", "Branch", "Lines", "Net Quantity", "Approved By", "Status", "Posted"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {adjustments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{a.id}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{a.sessionId}</TableCell>
                        <TableCell className="whitespace-nowrap">{a.branch}</TableCell>
                        <TableCell>{a.lines.length}</TableCell>
                        <TableCell>{a.lines.reduce((s, l) => s + l.qty, 0)}</TableCell>
                        <TableCell className="whitespace-nowrap">{a.approvedBy}</TableCell>
                        <TableCell><Pill tone="success">{a.status}</Pill></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(a.postedAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SectionCard title="Stock take audit events" desc="Every create, count, submit, recount, approval and posting event.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Event", "Record", "Detail", "Severity", "When"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {auditEvents.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{e.event}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{e.recordId}</TableCell>
                      <TableCell className="text-xs">{e.newValue ?? "—"}</TableCell>
                      <TableCell><Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "info"}>{e.severity}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!auditEvents.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No stock-take events recorded yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <CreateSessionDialog open={create} onOpenChange={setCreate} onCreated={onOpen} onCreate={createSession} users={users} rolesOf={(id) => activeRoles(assignments, id)} />
    </div>
  );
}

function SessionTable({
  sessions, onOpen, onStart, onCancel,
}: {
  sessions: StockTakeSession[];
  onOpen: (id: string) => void;
  onStart?: (id: string) => void;
  onCancel?: (id: string) => void;
}) {
  const users = useApprovalStore((s) => s.users);
  return (
    <div className="ui-table-scroll">
      <Table>
        <TableHeader>
          <TableRow>
            {["Session ID", "Session Name", "Count Date", "Branch", "Count Type", "Scope", "Assigned Team", "Total SKUs", "Counted", "Variance SKUs", "Progress", "Maker", "Checker", "Status", "Last Updated", "Actions"].map((h) => (
              <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const p = sessionProgress(s);
            return (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{s.id}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{s.name}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{s.countDate}</TableCell>
                <TableCell className="whitespace-nowrap">{s.branch}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{s.countType}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{s.scopeDetail.length ? s.scopeDetail.join(", ") : s.scope}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{s.counterIds.map((id) => userName(users, id)).join(", ")}</TableCell>
                <TableCell>{p.total}</TableCell>
                <TableCell>{p.counted}</TableCell>
                <TableCell>{p.varianceSkus}</TableCell>
                <TableCell className="whitespace-nowrap">{p.pct}%</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{userName(users, s.makerId)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{s.checkerAssignment === "Role-Based" ? s.checkerRole : userName(users, s.checkerUserId)}</TableCell>
                <TableCell><Pill tone={statusTone(s.status)}>{s.status}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => onOpen(s.id)}>Open</Button>
                    {onStart && (s.status === "Draft" || s.status === "Scheduled") && <Button size="sm" variant="ghost" className="h-8" onClick={() => onStart(s.id)}>Start</Button>}
                    {onCancel && !["Posted", "Approved", "Cancelled"].includes(s.status) && <Button size="sm" variant="ghost" className="h-8 text-critical" onClick={() => onCancel(s.id)}>Cancel</Button>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {!sessions.length && <TableRow><TableCell colSpan={16} className="py-8 text-center text-sm text-muted-foreground">No sessions here.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ————————————————————————— Count + variance screen —————————————————————————

function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const session = useStockTakeStore((s) => s.sessions.find((x) => x.id === id));
  const store = useStockTakeStore();
  const { users, assignments, currentUserId } = useApprovalStore();
  const me = users.find((u) => u.id === currentUserId);
  const canViewCost = me?.permissions.includes("View Cost") ?? false;
  const [scan, setScan] = useState("");
  const [qty, setQty] = useState("");
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!session) return <Button variant="outline" onClick={onBack}>Back</Button>;
  const p = sessionProgress(session);
  const locked = session.status === "Posted" || session.status === "Approved" || session.status === "Cancelled";
  const revealSystem = !session.blindCount || ["Submitted", "Recount Required", "Pending Checker", "Approved", "Posted", "Rejected"].includes(session.status);
  const line = session.lines.find((l) => l.id === activeLine);
  const varianceLines = session.lines.filter((l) => variance(l) !== 0);
  const reasonOptions = line ? (variance(line) > 0 ? POSITIVE_REASONS : variance(line) < 0 ? NEGATIVE_REASONS : [ZERO_REASON]) : [...POSITIVE_REASONS, ...NEGATIVE_REASONS];

  function submit() {
    const res = store.submitSession(session!.id, currentUserId);
    if (!res.ok) { toast.error(res.error ?? "Cannot submit"); return; }
    toast.success(res.approvalId ? `Submitted — approval ${res.approvalId} raised for the checker` : "Submitted");
  }

  function count(lineId: string, value: number | null, notFound = false) {
    if (locked) { toast.error("A posted session cannot be edited."); return; }
    store.recordCount(session!.id, lineId, value, userName(users, currentUserId), reason || undefined, notFound);
    setQty("");
    setReason("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Sessions</Button>
          <div>
            <h2 className="font-display text-xl font-bold">{session.name}</h2>
            <p className="text-xs text-muted-foreground">{session.id} · {session.branch} · {session.countType} · maker {userName(users, session.makerId)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={statusTone(session.status)}>{session.status}</Pill>
          <Pill tone={session.blindCount ? "warning" : "muted"}>{session.blindCount ? <><EyeOff className="h-3 w-3" /> Blind count</> : <><Eye className="h-3 w-3" /> Open count</>}</Pill>
          {["In Progress", "Draft", "Scheduled", "Recount Required"].includes(session.status) && (
            <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit}><Send className="h-4 w-4" /> Submit count</Button>
          )}
        </div>
      </div>

      <KpiGrid
        items={[
          { label: "Total SKUs", value: p.total },
          { label: "Counted", value: p.counted, tone: "info" },
          { label: "Remaining", value: p.remaining, tone: "warning" },
          { label: "Variance SKUs", value: revealSystem ? p.varianceSkus : "—", tone: "warning" },
          { label: "Net Variance", value: revealSystem ? p.netQty : "—", tone: p.netQty < 0 ? "critical" : "success" },
          { label: "Progress", value: `${p.pct}%` },
        ]}
      />

      <Tabs defaultValue="count">
        <TabsList>
          <TabsTrigger value="count">Count Screen</TabsTrigger>
          <TabsTrigger value="variance">Variance Review</TabsTrigger>
        </TabsList>

        <TabsContent value="count" className="mt-4">
          <SectionCard
            title="Scanner-friendly count"
            desc={session.blindCount && !revealSystem ? "Blind count — system quantity, variance and variance % stay hidden until the count is submitted." : "Open count — system quantity is visible to authorised counters."}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <ScanLine className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 w-52 pl-8"
                    placeholder="Scan barcode or SKU…"
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const hit = session.lines.find((l) => l.barcode === scan.trim() || l.sku.toLowerCase() === scan.trim().toLowerCase());
                      if (!hit) { toast.error("SKU not in this session's scope."); return; }
                      setActiveLine(hit.id);
                      setScan("");
                      toast.success(`${hit.product} ready to count`);
                    }}
                  />
                </div>
                {activeLine && (
                  <>
                    <Input className="h-9 w-28" type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
                    <SearchSelect className="w-56" options={reasonOptions.map(opt)} value={reason} onChange={setReason} placeholder="Reason code" />
                    <Button size="sm" onClick={() => count(activeLine, Number(qty))} disabled={qty === ""}>Save count</Button>
                    <Button size="sm" variant="outline" onClick={() => count(activeLine, 0, true)}>Mark not found</Button>
                  </>
                )}
              </div>
            }
          >
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["#", "SKU", "Product", "Brand", "Category", "UOM", "Barcode", ...(revealSystem ? ["System Qty"] : []), "First Count", "Recount", "Final Count", ...(revealSystem ? ["Variance", "Variance %"] : []), "Reason", "Status", "Counter", "Last Counted", "Action"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {session.lines.slice(0, 120).map((l) => (
                    <TableRow key={l.id} className={activeLine === l.id ? "bg-brand/5" : ""}>
                      <TableCell>{l.lineNo}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.product}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.brand}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.category}</TableCell>
                      <TableCell className="text-xs">{l.uom}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">{l.barcode || "—"}</TableCell>
                      {revealSystem && <TableCell>{l.systemQty}</TableCell>}
                      <TableCell>{l.firstCount ?? "—"}</TableCell>
                      <TableCell>{l.recountQty ?? "—"}</TableCell>
                      <TableCell>{l.finalCount ?? "—"}</TableCell>
                      {revealSystem && <TableCell className={variance(l) < 0 ? "text-critical" : variance(l) > 0 ? "text-[oklch(0.35_0.1_155)]" : ""}>{variance(l) || 0}</TableCell>}
                      {revealSystem && <TableCell className="text-xs">{variancePct(l).toFixed(2)}%</TableCell>}
                      <TableCell className="whitespace-nowrap text-xs">{l.reason || "—"}</TableCell>
                      <TableCell><Pill tone={l.status === "Matched" || l.status === "Accepted" ? "success" : l.status === "Recount Required" ? "warning" : l.status === "Not Found" ? "critical" : "muted"}>{l.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.counter || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{l.lastCountedAt ? new Date(l.lastCountedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" className="h-8" disabled={locked} onClick={() => setActiveLine(l.id)}>Count</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="variance" className="mt-4">
          <SectionCard
            title="Variance review"
            desc={`Only variance lines. ${canViewCost ? "Unit cost and variance value are visible because you hold View Cost." : "Unit cost and variance value are hidden — View Cost permission required."}`}
          >
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Total lines" value={p.total} />
              <Stat label="Matched" value={p.total - p.varianceSkus} />
              <Stat label="Positive" value={p.positive} />
              <Stat label="Negative" value={p.negative} />
              <Stat label="Net qty variance" value={p.netQty} />
              {canViewCost && <Stat label="Variance value" value={`SAR ${p.varianceValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />}
            </div>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["SKU", "Product", "Brand", "UOM", "System Qty", "First Count", "Recount", "Final Count", "Variance", "Variance %", ...(canViewCost ? ["Unit Cost", "Variance Value"] : []), "Reason", "Suggested Adjustment", "Status", "Action"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianceLines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.product}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.brand}</TableCell>
                      <TableCell className="text-xs">{l.uom}</TableCell>
                      <TableCell>{l.systemQty}</TableCell>
                      <TableCell>{l.firstCount ?? "—"}</TableCell>
                      <TableCell>{l.recountQty ?? "—"}</TableCell>
                      <TableCell>{l.finalCount ?? "—"}</TableCell>
                      <TableCell className={variance(l) < 0 ? "text-critical" : "text-[oklch(0.35_0.1_155)]"}>{variance(l)}</TableCell>
                      <TableCell className="text-xs">{variancePct(l).toFixed(2)}%</TableCell>
                      {canViewCost && <TableCell className="text-xs">{l.unitCost.toFixed(2)}</TableCell>}
                      {canViewCost && <TableCell className="text-xs">{(variance(l) * l.unitCost).toFixed(2)}</TableCell>}
                      <TableCell className="whitespace-nowrap">
                        <SearchSelect className="w-52" options={(variance(l) > 0 ? POSITIVE_REASONS : NEGATIVE_REASONS).map(opt)} value={l.reason} onChange={(v) => store.changeReason(session.id, l.id, v)} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{variance(l) > 0 ? `Increase ${variance(l)} ${l.uom}` : `Decrease ${Math.abs(variance(l))} ${l.uom}`}</TableCell>
                      <TableCell><Pill tone={l.status === "Accepted" ? "success" : l.status === "Recount Required" ? "warning" : "muted"}>{l.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8" disabled={locked} onClick={() => store.acceptVariance(session.id, l.id)}>Accept</Button>
                          <Button size="sm" variant="ghost" className="h-8" disabled={locked} onClick={() => store.requestRecount(session.id, [l.id], userName(users, currentUserId))}>Recount</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!varianceLines.length && <TableRow><TableCell colSpan={16} className="py-8 text-center text-sm text-muted-foreground">No variance lines.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            {session.approvalId && (
              <p className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-sm">
                Approval <span className="font-mono">{session.approvalId}</span> is with the checker
                ({session.checkerAssignment === "Role-Based" ? `role: ${session.checkerRole}` : userName(users, session.checkerUserId)}).
                {" "}The maker {userName(users, session.makerId)} cannot approve it. Decide it in Operate → Approval Management.
              </p>
            )}
            {session.adjustmentId && (
              <p className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
                Approved variance posted stock adjustment <span className="font-mono">{session.adjustmentId}</span>, linked back to every count line.
              </p>
            )}
            {void assignments}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
    </div>
  );
}

// ————————————————————————— Create session —————————————————————————

function CreateSessionDialog({
  open, onOpenChange, onCreate, onCreated, users, rolesOf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: ReturnType<typeof useStockTakeStore.getState>["createSession"];
  onCreated: (id: string) => void;
  users: { id: string; name: string }[];
  rolesOf: (id: string) => string[];
}) {
  const [d, setD] = useState({
    name: "", branch: BRANCH_LIST[0], countDate: new Date().toISOString().slice(0, 10),
    countType: "Cycle Count", priority: "Normal", notes: "", scope: "Selected Categories",
    scopeDetail: ["Cement & Binders"] as string[], stockType: "All On-Hand Stock", blindCount: true,
    makerId: "U-001", counterIds: ["U-001"] as string[], checkerAssignment: "Role-Based",
    checkerRole: "Inventory Manager", checkerUserId: "", qtyTolerance: 2, pctTolerance: 2,
    recountAboveTolerance: true, approvalRequired: true, autoAdjustment: true, skuCount: 24,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[min(88vh,60rem)] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-brand" /> Create stock take session</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <F label="Session Name"><Input className="h-9" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></F>
          <F label="Branch"><SearchSelect options={BRANCH_LIST.map(opt)} value={d.branch} onChange={(v) => setD({ ...d, branch: v })} /></F>
          <F label="Count Date"><Input className="h-9" type="date" value={d.countDate} onChange={(e) => setD({ ...d, countDate: e.target.value })} /></F>
          <F label="Count Type"><SearchSelect options={COUNT_TYPES.map(opt)} value={d.countType} onChange={(v) => setD({ ...d, countType: v })} /></F>
          <F label="Priority"><SearchSelect options={["Low", "Normal", "High", "Urgent"].map(opt)} value={d.priority} onChange={(v) => setD({ ...d, priority: v })} /></F>
          <F label="Scope"><SearchSelect options={SCOPES.map(opt)} value={d.scope} onChange={(v) => setD({ ...d, scope: v })} /></F>
          <F label="Categories / Brands in scope" className="md:col-span-2"><MultiSearchSelect options={CATEGORIES.map(opt)} values={d.scopeDetail} onChange={(v) => setD({ ...d, scopeDetail: v })} /></F>
          <F label="Stock Type"><SearchSelect options={[...STOCK_TYPES].map(opt)} value={d.stockType} onChange={(v) => setD({ ...d, stockType: v })} /></F>
          <F label="SKUs in session"><Input className="h-9" type="number" value={d.skuCount} onChange={(e) => setD({ ...d, skuCount: Number(e.target.value) })} /></F>
          <F label="Counting Method">
            <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={d.blindCount} onCheckedChange={(v) => setD({ ...d, blindCount: v })} /> Blind count (system qty hidden)</label>
          </F>
          <F label="Maker"><SearchSelect options={users.map((u) => ({ value: u.id, label: `${u.name} · ${rolesOf(u.id).join(", ")}` }))} value={d.makerId} onChange={(v) => setD({ ...d, makerId: v })} /></F>
          <F label="Counters" className="md:col-span-2"><MultiSearchSelect options={users.map((u) => ({ value: u.id, label: u.name }))} values={d.counterIds} onChange={(v) => setD({ ...d, counterIds: v })} /></F>
          <F label="Checker Assignment"><SearchSelect options={["Role-Based", "User-Based"].map(opt)} value={d.checkerAssignment} onChange={(v) => setD({ ...d, checkerAssignment: v })} /></F>
          {d.checkerAssignment === "Role-Based" ? (
            <F label="Checker Role"><SearchSelect options={[...ROLES].map(opt)} value={d.checkerRole} onChange={(v) => setD({ ...d, checkerRole: v })} /></F>
          ) : (
            <F label="Checker User"><SearchSelect options={users.filter((u) => u.id !== d.makerId).map((u) => ({ value: u.id, label: u.name }))} value={d.checkerUserId} onChange={(v) => setD({ ...d, checkerUserId: v })} /></F>
          )}
          <F label="Quantity Tolerance"><Input className="h-9" type="number" value={d.qtyTolerance} onChange={(e) => setD({ ...d, qtyTolerance: Number(e.target.value) })} /></F>
          <F label="Percentage Tolerance"><Input className="h-9" type="number" value={d.pctTolerance} onChange={(e) => setD({ ...d, pctTolerance: Number(e.target.value) })} /></F>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={d.recountAboveTolerance} onCheckedChange={(v) => setD({ ...d, recountAboveTolerance: v })} /> Recount above tolerance</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={d.approvalRequired} onCheckedChange={(v) => setD({ ...d, approvalRequired: v })} /> Approval required</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={d.autoAdjustment} onCheckedChange={(v) => setD({ ...d, autoAdjustment: v })} /> Auto-create adjustment after approval</label>
          </div>
          <F label="Notes" className="md:col-span-2"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></F>
        </div>
        <DialogFooter>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => {
              if (d.checkerAssignment === "User-Based" && d.checkerUserId === d.makerId) { toast.error("The checker cannot be the maker."); return; }
              if (d.counterIds.includes(d.checkerUserId)) { toast.error("The checker cannot also be a counter."); return; }
              const id = onCreate({
                name: d.name || "Untitled stock take",
                branch: d.branch,
                countDate: d.countDate,
                countType: d.countType as StockTakeSession["countType"],
                scope: d.scope,
                scopeDetail: d.scopeDetail,
                stockType: d.stockType,
                blindCount: d.blindCount,
                priority: d.priority as StockTakeSession["priority"],
                notes: d.notes,
                makerId: d.makerId,
                counterIds: d.counterIds,
                checkerAssignment: d.checkerAssignment as "Role-Based" | "User-Based",
                checkerRole: d.checkerRole as Role,
                checkerUserId: d.checkerUserId || undefined,
                qtyTolerance: d.qtyTolerance,
                pctTolerance: d.pctTolerance,
                recountAboveTolerance: d.recountAboveTolerance,
                approvalRequired: d.approvalRequired,
                autoAdjustment: d.autoAdjustment,
                skuCount: d.skuCount,
              });
              toast.success(`${id} created`);
              onOpenChange(false);
              onCreated(id);
            }}
          >
            Create session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}