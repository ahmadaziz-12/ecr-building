import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, UserCog, AlertTriangle, ArrowUpRight } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SearchSelect, MultiSearchSelect } from "@/components/buildpos/SearchSelect";
import {
  APPROVAL_MODULES, BRANCH_LIST, PERMISSION_LIST, ROLES, TERMINAL_LIST, activeRoles, checkEligibility,
  useApprovalStore, userName, type ApprovalRequest, type Role,
} from "@/lib/approvals/store";
import "@/lib/stock/stock-take-store"; // registers the Stock Taking approval handler
import type { Severity } from "@/lib/buildpos/format";

const opt = (v: string) => ({ value: v, label: v });

function tone(status: string): Severity {
  if (status === "Approved") return "success";
  if (status === "Rejected") return "critical";
  if (status === "Escalated" || status === "Returned for Correction" || status === "Reassigned") return "warning";
  return "info";
}

const INBOX_TABS = ["My Pending Approvals", "Submitted by Me", "Approved", "Rejected", "Reassigned", "Escalated", "All Approvals"] as const;

export function ApprovalsWorkspace() {
  const store = useApprovalStore();
  const { requests, users, assignments, matrix, currentUserId } = store;
  const me = users.find((u) => u.id === currentUserId);

  const [tab, setTab] = useState<(typeof INBOX_TABS)[number]>("My Pending Approvals");
  const [moduleFilter, setModuleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<ApprovalRequest | null>(null);
  const [comment, setComment] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  const visible = useMemo(() => {
    const base = requests
      .filter((r) => !moduleFilter || r.module === moduleFilter)
      .filter((r) => !branchFilter || r.branch === branchFilter)
      .filter((r) => !search || `${r.id} ${r.recordRef} ${r.requestType}`.toLowerCase().includes(search.toLowerCase()));
    switch (tab) {
      case "My Pending Approvals":
        return base.filter((r) => checkEligibility({ users, assignments }, r, currentUserId).eligible);
      case "Submitted by Me": return base.filter((r) => r.makerId === currentUserId);
      case "Approved": return base.filter((r) => r.status === "Approved");
      case "Rejected": return base.filter((r) => r.status === "Rejected" || r.status === "Returned for Correction");
      case "Reassigned": return base.filter((r) => r.status === "Reassigned");
      case "Escalated": return base.filter((r) => r.status === "Escalated");
      default: return base;
    }
  }, [requests, tab, moduleFilter, branchFilter, search, users, assignments, currentUserId]);

  const myPending = requests.filter((r) => checkEligibility({ users, assignments }, r, currentUserId).eligible).length;
  const overdue = requests.filter((r) => r.dueAt < Date.now() && !["Approved", "Rejected", "Cancelled"].includes(r.status)).length;

  function decide(req: ApprovalRequest, action: "approve" | "reject" | "return") {
    const res = store.decide(req.id, currentUserId, action, comment || undefined);
    if (!res.ok) { toast.error(res.error ?? "Not permitted"); return; }
    toast.success(`${req.id} — ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned to maker"}`);
    setComment("");
    setOpen(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Operate"
        title="Approval Management"
        desc="One maker-checker queue for every module. The maker can never approve their own request — the store enforces role, branch and limit eligibility on every decision."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Acting as</span>
            <SearchSelect
              className="w-56"
              options={users.map((u) => ({ value: u.id, label: `${u.name} · ${activeRoles(assignments, u.id).join(", ") || "no role"}` }))}
              value={currentUserId}
              onChange={store.setCurrentUser}
            />
          </div>
        }
      />
      <KpiGrid
        scope="approvals"
        items={[
          { label: "My Pending", value: myPending, tone: "warning" },
          { label: "In Progress", value: requests.filter((r) => r.status === "In Progress").length, tone: "info" },
          { label: "Approved", value: requests.filter((r) => r.status === "Approved").length, tone: "success" },
          { label: "Rejected", value: requests.filter((r) => r.status === "Rejected").length, tone: "critical" },
          { label: "Overdue", value: overdue, tone: "critical" },
          { label: "Workflows", value: matrix.filter((m) => m.active).length, tone: "muted" },
        ]}
      />

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Approval Inbox</TabsTrigger>
          <TabsTrigger value="matrix">Approval Matrix</TabsTrigger>
          <TabsTrigger value="access">Users, Roles & Access</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {INBOX_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === t ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <SectionCard
            title={tab}
            action={
              <div className="flex flex-wrap gap-2">
                <SearchSelect className="w-48" options={[{ value: "", label: "All modules" }, ...APPROVAL_MODULES.map(opt)]} value={moduleFilter} onChange={setModuleFilter} placeholder="Module" />
                <SearchSelect className="w-52" options={[{ value: "", label: "All branches" }, ...BRANCH_LIST.map(opt)]} value={branchFilter} onChange={setBranchFilter} placeholder="Branch" />
                <Input className="h-9 w-52" placeholder="Search approvals…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          >
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Approval ID", "Request Type", "Record", "Branch", "Maker", "Assigned Checker", "Requested", "Priority", "Amount / Variance", "Status", "Due", "Actions"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => {
                    const pending = r.levels.find((l) => l.status === "Pending");
                    const eligibility = checkEligibility({ users, assignments }, r, currentUserId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.requestType}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{r.recordRef}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.branch}</TableCell>
                        <TableCell className="whitespace-nowrap">{userName(users, r.makerId)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{pending ? (pending.assignmentType === "Role-Based" ? `Role: ${pending.role}` : userName(users, pending.userId)) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(r.requestedAt).toLocaleString()}</TableCell>
                        <TableCell><Pill tone={r.priority === "Urgent" || r.priority === "High" ? "warning" : "muted"}>{r.priority}</Pill></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.amount != null ? `SAR ${r.amount.toLocaleString()}` : r.variance ?? "—"}</TableCell>
                        <TableCell><Pill tone={tone(r.status)}>{r.status}</Pill></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.dueAt < Date.now() && !["Approved", "Rejected"].includes(r.status) ? <span className="text-critical">Overdue</span> : new Date(r.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => { setOpen(r); setComment(""); }}>
                            {eligibility.eligible ? "Review" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!visible.length && <TableRow><TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">Nothing in this tab.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <MatrixTab />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <AccessTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[min(88vh,60rem)] overflow-y-auto">
          {open && (() => {
            const eligibility = checkEligibility({ users, assignments }, open, currentUserId);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> {open.id} · {open.requestType}</DialogTitle>
                  <DialogDescription>{open.module} · {open.recordRef} · {open.branch} · maker {userName(users, open.makerId)} ({open.makerRole})</DialogDescription>
                </DialogHeader>

                {!eligibility.eligible && (
                  <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{eligibility.reason}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approval levels · {open.mode}</p>
                  {open.levels.map((l) => (
                    <div key={l.level} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-2.5 text-sm">
                      <span>Level {l.level} · {l.assignmentType === "Role-Based" ? l.role : userName(users, l.userId)}</span>
                      <span className="flex items-center gap-2">
                        {l.decidedBy && <span className="text-xs text-muted-foreground">{userName(users, l.decidedBy)}</span>}
                        <Pill tone={l.status === "Approved" ? "success" : l.status === "Rejected" ? "critical" : l.status === "Pending" ? "warning" : "muted"}>{l.status}</Pill>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Audit history</p>
                  {open.history.map((h, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{new Date(h.ts).toLocaleString()} · <span className="text-foreground">{h.actor}</span> — {h.action}{h.detail ? ` · ${h.detail}` : ""}</p>
                  ))}
                </div>

                <Textarea rows={2} placeholder="Comment (required to reject or return)" value={comment} onChange={(e) => setComment(e.target.value)} />

                <div className="flex flex-wrap items-center gap-2">
                  <SearchSelect className="w-56" options={users.filter((u) => u.id !== open.makerId).map((u) => ({ value: u.id, label: u.name }))} value={reassignTo} onChange={setReassignTo} placeholder="Reassign to…" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const level = open.levels.find((l) => l.status === "Pending")?.level ?? 1;
                      const res = store.reassign(open.id, level, reassignTo, currentUserId, comment || "Reassigned by checker");
                      res.ok ? toast.success("Reassigned") : toast.error(res.error ?? "");
                      setOpen(null);
                    }}
                    disabled={!reassignTo}
                  >
                    Reassign
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { store.escalate(open.id, currentUserId); toast.success("Escalated to fallback approver"); setOpen(null); }}>
                    <ArrowUpRight className="h-3.5 w-3.5" /> Escalate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { store.addComment(open.id, currentUserId, comment); setComment(""); toast.success("Comment added"); }} disabled={!comment}>Add comment</Button>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" disabled={!eligibility.eligible || !comment} onClick={() => decide(open, "return")}>Return for correction</Button>
                  <Button variant="outline" className="text-critical" disabled={!eligibility.eligible || !comment} onClick={() => decide(open, "reject")}>Reject</Button>
                  <Button className="bg-brand text-brand-foreground hover:bg-brand/90" disabled={!eligibility.eligible} onClick={() => decide(open, "approve")}>Approve</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ————————————————————————— Approval Matrix —————————————————————————

function MatrixTab() {
  const { matrix, users, upsertMatrix, toggleMatrix } = useApprovalStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "", module: "Stock Adjustments", transactionType: "", assignmentType: "Role-Based" as "Role-Based" | "User-Based" | "Multi-Level",
    makerRole: "Inventory Officer" as Role, checkerRole: "Inventory Manager" as Role, checkerUserId: "",
    branchScope: [...BRANCH_LIST], minAmount: "", maxAmount: "", minVariance: "", maxVariance: "",
    sequence: "Sequential" as "Sequential" | "Parallel", pinRequired: false, attachmentRequired: false,
    reasonRequired: true, escalationHours: 8, fallbackRole: "Store Manager" as Role,
  });

  return (
    <SectionCard
      title="Approval Matrix"
      desc="Which module and transaction type routes to which checker, within which amount or variance band."
      action={<Button size="sm" className="h-8 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setOpen(true)}>New workflow</Button>}
    >
      <div className="ui-table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              {["Workflow", "Module", "Transaction Type", "Assignment", "Maker Role", "Checker", "Branch Scope", "Amount Band", "Variance Band", "Sequence", "PIN", "Escalation", "Fallback", "Status"].map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap font-medium">{m.name}</TableCell>
                <TableCell className="whitespace-nowrap">{m.module}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.transactionType}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.assignmentType}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.makerRole}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.checkerRole ?? userName(users, m.checkerUserId)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.branchScope.length === BRANCH_LIST.length ? "All branches" : `${m.branchScope.length} branch(es)`}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.minAmount ? `≥ SAR ${m.minAmount.toLocaleString()}` : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.minVariance ? `> ${m.minVariance}` : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.sequence}</TableCell>
                <TableCell className="text-xs">{m.pinRequired ? "Yes" : "No"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.escalationHours}h</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.fallbackRole ?? "—"}</TableCell>
                <TableCell>
                  <button type="button" onClick={() => toggleMatrix(m.id)}>
                    <Pill tone={m.active ? "success" : "muted"}>{m.active ? "Active" : "Inactive"}</Pill>
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[min(88vh,60rem)] overflow-y-auto">
          <DialogHeader><DialogTitle>New approval workflow</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <L label="Workflow Name"><Input className="h-9" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></L>
            <L label="Module"><SearchSelect options={APPROVAL_MODULES.map(opt)} value={draft.module} onChange={(v) => setDraft({ ...draft, module: v })} /></L>
            <L label="Transaction Type"><Input className="h-9" value={draft.transactionType} onChange={(e) => setDraft({ ...draft, transactionType: e.target.value })} /></L>
            <L label="Assignment Type"><SearchSelect options={["Role-Based", "User-Based", "Multi-Level"].map(opt)} value={draft.assignmentType} onChange={(v) => setDraft({ ...draft, assignmentType: v as typeof draft.assignmentType })} /></L>
            <L label="Maker Role"><SearchSelect options={ROLES.map(opt)} value={draft.makerRole} onChange={(v) => setDraft({ ...draft, makerRole: v as Role })} /></L>
            {draft.assignmentType === "User-Based" ? (
              <L label="Checker User"><SearchSelect options={users.map((u) => ({ value: u.id, label: u.name }))} value={draft.checkerUserId} onChange={(v) => setDraft({ ...draft, checkerUserId: v })} /></L>
            ) : (
              <L label="Checker Role"><SearchSelect options={ROLES.map(opt)} value={draft.checkerRole} onChange={(v) => setDraft({ ...draft, checkerRole: v as Role })} /></L>
            )}
            <L label="Branch Scope" className="md:col-span-2"><MultiSearchSelect options={BRANCH_LIST.map(opt)} values={draft.branchScope} onChange={(v) => setDraft({ ...draft, branchScope: v })} /></L>
            <L label="Minimum Amount"><Input className="h-9" type="number" value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} /></L>
            <L label="Maximum Amount"><Input className="h-9" type="number" value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} /></L>
            <L label="Minimum Variance"><Input className="h-9" type="number" value={draft.minVariance} onChange={(e) => setDraft({ ...draft, minVariance: e.target.value })} /></L>
            <L label="Maximum Variance"><Input className="h-9" type="number" value={draft.maxVariance} onChange={(e) => setDraft({ ...draft, maxVariance: e.target.value })} /></L>
            <L label="Sequential / Parallel"><SearchSelect options={["Sequential", "Parallel"].map(opt)} value={draft.sequence} onChange={(v) => setDraft({ ...draft, sequence: v as typeof draft.sequence })} /></L>
            <L label="Escalation (hours)"><Input className="h-9" type="number" value={draft.escalationHours} onChange={(e) => setDraft({ ...draft, escalationHours: Number(e.target.value) })} /></L>
            <L label="Fallback Role"><SearchSelect options={ROLES.map(opt)} value={draft.fallbackRole} onChange={(v) => setDraft({ ...draft, fallbackRole: v as Role })} /></L>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              <Toggle label="PIN required" checked={draft.pinRequired} onChange={(v) => setDraft({ ...draft, pinRequired: v })} />
              <Toggle label="Attachment required" checked={draft.attachmentRequired} onChange={(v) => setDraft({ ...draft, attachmentRequired: v })} />
              <Toggle label="Reason required" checked={draft.reasonRequired} onChange={(v) => setDraft({ ...draft, reasonRequired: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                upsertMatrix({
                  id: `AMX-${String(Date.now()).slice(-5)}`,
                  name: draft.name || "Untitled workflow",
                  module: draft.module,
                  transactionType: draft.transactionType,
                  assignmentType: draft.assignmentType,
                  makerRole: draft.makerRole,
                  checkerRole: draft.assignmentType === "User-Based" ? undefined : draft.checkerRole,
                  checkerUserId: draft.assignmentType === "User-Based" ? draft.checkerUserId : undefined,
                  branchScope: draft.branchScope,
                  minAmount: draft.minAmount ? Number(draft.minAmount) : undefined,
                  maxAmount: draft.maxAmount ? Number(draft.maxAmount) : undefined,
                  minVariance: draft.minVariance ? Number(draft.minVariance) : undefined,
                  maxVariance: draft.maxVariance ? Number(draft.maxVariance) : undefined,
                  sequence: draft.sequence,
                  pinRequired: draft.pinRequired,
                  attachmentRequired: draft.attachmentRequired,
                  reasonRequired: draft.reasonRequired,
                  escalationHours: draft.escalationHours,
                  fallbackRole: draft.fallbackRole,
                  active: true,
                });
                toast.success("Workflow added");
                setOpen(false);
              }}
            >
              Save workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ————————————————————————— Users, roles, access —————————————————————————

function AccessTab() {
  const store = useApprovalStore();
  const { users, assignments } = store;
  const [selected, setSelected] = useState(users[0]?.id ?? "");
  const user = users.find((u) => u.id === selected);
  const [role, setRole] = useState<Role>("Cashier");
  const [branches, setBranches] = useState<string[]>(["Riyadh Main Branch"]);
  const [terminals, setTerminals] = useState<string[]>([]);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <SectionCard title="Users" desc="Deactivating a user removes their ability to act as a checker immediately.">
        <div className="ui-table-scroll">
          <Table>
            <TableHeader><TableRow>{["User", "Branch", "Roles", "Status", ""].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.id === selected ? "bg-brand/5" : ""}>
                  <TableCell className="whitespace-nowrap"><button type="button" className="text-left font-medium hover:text-brand" onClick={() => setSelected(u.id)}>{u.name}</button><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{u.branch}</TableCell>
                  <TableCell className="text-xs">{activeRoles(assignments, u.id).join(", ") || "—"}</TableCell>
                  <TableCell><Pill tone={u.active ? "success" : "muted"}>{u.active ? "Active" : "Inactive"}</Pill></TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-8" onClick={() => store.setUserActive(u.id, !u.active)}>{u.active ? "Deactivate" : "Reactivate"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title={user ? `${user.name} — access` : "Access"} desc="Role assignments, direct permissions, branch and terminal access.">
        {user && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><UserCog className="h-3.5 w-3.5" /> Role assignments</p>
              <div className="space-y-2">
                {assignments.filter((a) => a.userId === user.id).map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{a.role}</p>
                      <p className="text-xs text-muted-foreground">{a.branchScope.join(", ")} · from {a.effectiveFrom}{a.effectiveTo ? ` to ${a.effectiveTo}` : ""} · by {a.assignedBy}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={a.status === "Active" ? "success" : a.status === "Removed" ? "critical" : "warning"}>{a.status}</Pill>
                      {a.status === "Active" && <Button size="sm" variant="ghost" className="h-8" onClick={() => store.suspendRole(a.id, store.currentUserId)}>Suspend</Button>}
                      {a.status === "Suspended" && <Button size="sm" variant="ghost" className="h-8" onClick={() => store.reactivateRole(a.id)}>Reactivate</Button>}
                      {a.status !== "Removed" && <Button size="sm" variant="ghost" className="h-8 text-critical" onClick={() => { store.removeRole(a.id, store.currentUserId); toast.success("Role removed — pending approvals reassigned"); }}>Remove</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 md:grid-cols-2">
              <L label="Role"><SearchSelect options={ROLES.map(opt)} value={role} onChange={(v) => setRole(v as Role)} /></L>
              <L label="Branch Scope"><MultiSearchSelect options={BRANCH_LIST.map(opt)} values={branches} onChange={setBranches} /></L>
              <L label="Terminal Scope"><MultiSearchSelect options={TERMINAL_LIST.map(opt)} values={terminals} onChange={setTerminals} /></L>
              <L label="Effective From"><Input className="h-9" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></L>
              <L label="Effective To"><Input className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></L>
              <L label="Assignment Reason"><Input className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} /></L>
              <div className="md:col-span-2">
                <Button
                  size="sm"
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={() => {
                    store.assignRole({ userId: user.id, role, branchScope: branches, terminalScope: terminals, effectiveFrom: from, effectiveTo: to || undefined, reason: reason || "Role assignment", assignedBy: userName(users, store.currentUserId) });
                    toast.success(`${role} assigned to ${user.name}`);
                  }}
                >
                  Assign role
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Direct permissions</p>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_LIST.map((p) => (
                  <button key={p} type="button" onClick={() => store.togglePermission(user.id, p)} className={`rounded-full border px-2.5 py-1 text-xs ${user.permissions.includes(p) ? "border-brand bg-brand/10 text-brand" : "border-black/10 bg-white text-muted-foreground"}`}>{p}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal access</p>
              <div className="flex flex-wrap gap-1.5">
                {TERMINAL_LIST.map((t) => (
                  <button key={t} type="button" onClick={() => store.toggleTerminal(user.id, t)} className={`rounded-full border px-2.5 py-1 text-xs ${user.terminals.includes(t) ? "border-brand bg-brand/10 text-brand" : "border-black/10 bg-white text-muted-foreground"}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function L({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} /> {label}
    </label>
  );
}