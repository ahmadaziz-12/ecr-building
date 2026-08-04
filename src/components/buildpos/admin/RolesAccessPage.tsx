// §87 Roles & Permissions workspace - role master, feature-level permission matrix, multi-role
// user assignments, direct allow/deny exceptions under maker-checker, approval authority limits,
// access review and permission activity logs. Backed by useRbacStore (local persistence).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Shield, ShieldAlert, ShieldCheck, UserCog, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, Pill } from "@/components/buildpos/sections";
import {
  BRANCH_SCOPES, PERMISSION_ACTIONS, PERMISSION_CATALOG, PERMISSION_MODULES, RECORD_SCOPES,
  ROLE_TYPES, TERMINAL_SCOPES, effectiveState, useRbacStore, usersWithRoles,
  type PermissionActionKey, type RbacRole,
} from "@/lib/admin/rbac-store";
import { useAuditStore } from "@/lib/store/audit";

const CORE_ACTIONS: PermissionActionKey[] = ["Create", "Read", "Update", "Delete", "Submit", "Approve", "Export"];

function statusTone(status: string) {
  if (status === "Active" || status === "Approved") return "success" as const;
  if (status === "Pending Approval" || status === "Draft" || status === "Scheduled") return "warning" as const;
  if (status === "Rejected" || status === "Suspended" || status === "Removed" || status === "Inactive") return "critical" as const;
  return "muted" as const;
}

export function RolesAccessPage() {
  const store = useRbacStore();
  const events = useAuditStore((s) => s.events);
  const [tab, setTab] = useState("roles");
  const [selectedRoleId, setSelectedRoleId] = useState(store.roles[0]?.id ?? "");
  const [moduleFilter, setModuleFilter] = useState<string>(PERMISSION_MODULES[0]);
  const [featureSearch, setFeatureSearch] = useState("");
  const [roleDialog, setRoleDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [directDialog, setDirectDialog] = useState(false);
  const [reviewUser, setReviewUser] = useState(usersWithRoles(store)[0] ?? "");
  const [checker, setChecker] = useState("System Administrator");

  const selectedRole = store.roles.find((r) => r.id === selectedRoleId) ?? store.roles[0];

  const features = useMemo(() => {
    const q = featureSearch.trim().toLowerCase();
    return PERMISSION_CATALOG.filter(
      (f) => f.module === moduleFilter && (!q || f.feature.toLowerCase().includes(q) || f.submodule.toLowerCase().includes(q))
    );
  }, [moduleFilter, featureSearch]);

  const permissionEvents = events.filter((e) =>
    /ROLE_|PERMISSION|ACCESS_REQUEST|APPROVAL_LIMIT/.test(e.event)
  );

  const grantedCount = (role: RbacRole) =>
    Object.values(role.permissions).reduce((sum, cell) => sum + Object.values(cell).filter(Boolean).length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Roles &amp; Permissions</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Role master · feature-level permission matrix · scopes &amp; limits · direct user exceptions · access review
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAssignDialog(true)}><Users className="mr-1.5 h-4 w-4" />Assign Role</Button>
          <Button size="sm" variant="outline" onClick={() => setDirectDialog(true)}><KeyRound className="mr-1.5 h-4 w-4" />Request Access</Button>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setRoleDialog(true)}><Plus className="mr-1.5 h-4 w-4" />New Role</Button>
        </div>
      </div>

      <div className="ui-card-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SectionCard><p className="text-xs text-muted-foreground">Roles</p><p className="font-display text-2xl font-bold">{store.roles.length}</p></SectionCard>
        <SectionCard><p className="text-xs text-muted-foreground">Users with roles</p><p className="font-display text-2xl font-bold">{usersWithRoles(store).length}</p></SectionCard>
        <SectionCard><p className="text-xs text-muted-foreground">Direct exceptions</p><p className="font-display text-2xl font-bold">{store.direct.filter((d) => d.status === "Active").length}</p></SectionCard>
        <SectionCard><p className="text-xs text-muted-foreground">Pending access requests</p><p className="font-display text-2xl font-bold text-amber-600">{store.direct.filter((d) => d.status === "Pending Approval").length}</p></SectionCard>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="roles">Role Master</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="assignments">User Assignments</TabsTrigger>
          <TabsTrigger value="direct">Direct Permissions</TabsTrigger>
          <TabsTrigger value="authority">Approval Authority</TabsTrigger>
          <TabsTrigger value="review">Access Review</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <SectionCard title="Role master" desc={`${store.roles.length} roles · scope and record visibility per role`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-3">Role</th><th className="px-3">Code</th><th className="px-3">Type</th>
                    <th className="px-3">Branch scope</th><th className="px-3">Record scope</th>
                    <th className="px-3">Users</th><th className="px-3">Grants</th><th className="px-3">Status</th><th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {store.roles.map((r) => (
                    <tr key={r.id} className="align-middle">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-foreground">{r.name}</p>
                        <p className="max-w-[340px] truncate text-xs text-muted-foreground">{r.description}</p>
                      </td>
                      <td className="px-3 font-mono text-xs">{r.code}</td>
                      <td className="px-3 text-xs">{r.type}</td>
                      <td className="px-3 text-xs">{r.branchScope}</td>
                      <td className="px-3 text-xs">{r.recordScope}</td>
                      <td className="px-3">{store.assignments.filter((a) => a.roleId === r.id && a.status === "Active").length}</td>
                      <td className="px-3">{grantedCount(r)}</td>
                      <td className="px-3"><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                      <td className="px-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedRoleId(r.id); setTab("matrix"); }}>Permissions</Button>
                          <Button size="sm" variant="ghost" onClick={() => { store.duplicateRole(r.id); toast.success(`${r.name} duplicated as a draft role`); }}><Copy className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { store.setRoleStatus(r.id, r.status === "Active" ? "Inactive" : "Active"); toast.success(`${r.name} ${r.status === "Active" ? "deactivated" : "activated"}`); }}>
                            {r.status === "Active" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <SectionCard
            title={`Permission matrix — ${selectedRole?.name ?? ""}`}
            desc="Module → Submodule → Feature → Action. Changes save immediately and are written to the permission activity log."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{store.roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{PERMISSION_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9 w-[180px]" placeholder="Search feature" value={featureSearch} onChange={(e) => setFeatureSearch(e.target.value)} />
              </div>
            }
          >
            {selectedRole && (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { store.bulkSet(selectedRole.id, features.map((f) => f.key), CORE_ACTIONS, true); toast.success(`Granted all ${moduleFilter} actions`); }}>Grant module</Button>
                  <Button size="sm" variant="outline" onClick={() => { store.bulkSet(selectedRole.id, features.map((f) => f.key), [...PERMISSION_ACTIONS], false); toast.success(`Cleared all ${moduleFilter} actions`); }}>Clear module</Button>
                  <Button size="sm" variant="outline" onClick={() => { store.bulkSet(selectedRole.id, features.map((f) => f.key), ["Read"], true); toast.success("View-only granted"); }}>View only</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-black/5">
                        <th className="py-2 pr-3 text-left">Feature</th>
                        {PERMISSION_ACTIONS.map((a) => <th key={a} className="px-2 text-center font-medium">{a}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {features.map((f) => (
                        <tr key={f.key}>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-foreground">{f.feature}</p>
                            <p className="text-xs text-muted-foreground">{f.submodule}</p>
                          </td>
                          {PERMISSION_ACTIONS.map((a) => (
                            <td key={a} className="px-2 text-center">
                              <Checkbox
                                checked={Boolean(selectedRole.permissions[f.key]?.[a])}
                                onCheckedChange={() => store.togglePermission(selectedRole.id, f.key, a)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <SectionCard title="User access assignments" desc="A user may hold multiple roles; the effective permission set is the union, minus any direct deny.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-3">User</th><th className="px-3">Role</th><th className="px-3">Branch scope</th>
                    <th className="px-3">Terminal scope</th><th className="px-3">Effective from</th><th className="px-3">Assigned by</th>
                    <th className="px-3">Status</th><th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {store.assignments.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2.5 pr-3 font-medium text-foreground">{a.userName}</td>
                      <td className="px-3">{store.roles.find((r) => r.id === a.roleId)?.name ?? a.roleId}</td>
                      <td className="px-3 text-xs">{a.branchScope}</td>
                      <td className="px-3 text-xs">{a.terminalScope}</td>
                      <td className="px-3 text-xs">{a.effectiveFrom}{a.temporary && a.effectiveTo ? ` → ${a.effectiveTo}` : ""}</td>
                      <td className="px-3 text-xs">{a.assignedBy}</td>
                      <td className="px-3"><Pill tone={statusTone(a.status)}>{a.status}</Pill></td>
                      <td className="px-3">
                        <div className="flex justify-end gap-1.5">
                          {a.status === "Active" ? (
                            <Button size="sm" variant="outline" onClick={() => { store.setAssignmentStatus(a.id, "Suspended"); toast.success("Assignment suspended"); }}>Suspend</Button>
                          ) : a.status !== "Removed" ? (
                            <Button size="sm" variant="outline" onClick={() => { store.setAssignmentStatus(a.id, "Active"); toast.success("Assignment reactivated"); }}>Activate</Button>
                          ) : null}
                          {a.status !== "Removed" && (
                            <Button size="sm" variant="ghost" onClick={() => { store.setAssignmentStatus(a.id, "Removed"); toast.success("Role removed from user"); }}>Remove</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="direct" className="mt-4">
          <SectionCard
            title="Direct user permissions"
            desc="Exceptions layered over role permissions. A direct deny always wins over an inherited allow."
            action={
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Checker</Label>
                <Input className="h-9 w-[180px]" value={checker} onChange={(e) => setChecker(e.target.value)} />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-3">User</th><th className="px-3">Feature</th><th className="px-3">Action</th>
                    <th className="px-3">Mode</th><th className="px-3">Scope</th><th className="px-3">Requested by</th>
                    <th className="px-3">Status</th><th className="px-3 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {store.direct.map((d) => {
                    const f = PERMISSION_CATALOG.find((x) => x.key === d.featureKey);
                    return (
                      <tr key={d.id}>
                        <td className="py-2.5 pr-3 font-medium text-foreground">{d.userName}</td>
                        <td className="px-3">
                          <p>{f?.feature ?? d.featureKey}</p>
                          <p className="text-xs text-muted-foreground">{f ? `${f.module} · ${f.submodule}` : ""}</p>
                        </td>
                        <td className="px-3 text-xs">{d.action}</td>
                        <td className="px-3"><Pill tone={d.mode === "Deny" ? "critical" : "success"}>{d.mode}</Pill></td>
                        <td className="px-3 text-xs">{d.branch}{d.terminal && d.terminal !== "-" ? ` · ${d.terminal}` : ""}</td>
                        <td className="px-3 text-xs">{d.requestedBy}</td>
                        <td className="px-3"><Pill tone={statusTone(d.status)}>{d.status}</Pill></td>
                        <td className="px-3">
                          <div className="flex justify-end gap-1.5">
                            {d.status === "Pending Approval" ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => {
                                  const err = store.decideDirect(d.id, true, checker);
                                  err ? toast.error(err) : toast.success("Access request approved");
                                }}>Approve</Button>
                                <Button size="sm" variant="ghost" onClick={() => { store.decideDirect(d.id, false, checker); toast.success("Access request rejected"); }}>Reject</Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => { store.removeDirect(d.id); toast.success("Direct permission removed"); }}>Remove</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="authority" className="mt-4">
          <SectionCard title="Approval authority" desc="Financial and percentage ceilings evaluated before any approval action is accepted.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-3">Role</th><th className="px-3">Module</th><th className="px-3">Transaction</th>
                    <th className="px-3">Max amount (SAR)</th><th className="px-3">Max discount %</th><th className="px-3">Branch scope</th><th className="px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {store.limits.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-3 font-medium text-foreground">{store.roles.find((r) => r.id === l.roleId)?.name ?? l.roleId}</td>
                      <td className="px-3 text-xs">{l.module}</td>
                      <td className="px-3 text-xs">{l.transactionType}</td>
                      <td className="px-3">
                        <Input
                          className="h-8 w-[130px]" type="number" value={l.maxAmount}
                          onChange={(e) => store.updateLimit(l.id, { maxAmount: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3">
                        <Input
                          className="h-8 w-[90px]" type="number" value={l.maxDiscountPercent ?? 0}
                          onChange={(e) => store.updateLimit(l.id, { maxDiscountPercent: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 text-xs">{l.branchScope}</td>
                      <td className="px-3"><Pill tone={statusTone(l.status)}>{l.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <SectionCard
            title="Access review"
            desc="Effective access for one user across a module — role inheritance merged with direct exceptions."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={reviewUser} onValueChange={setReviewUser}>
                  <SelectTrigger className="h-9 w-[210px]"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>{usersWithRoles(store).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{PERMISSION_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Inherited / direct allow</span>
              <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Direct deny</span>
              <span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Denied</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-3 text-left">Feature</th>
                    {CORE_ACTIONS.map((a) => <th key={a} className="px-2 text-center font-medium">{a}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {PERMISSION_CATALOG.filter((f) => f.module === moduleFilter).map((f) => (
                    <tr key={f.key}>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-foreground">{f.feature}</p>
                        <p className="text-xs text-muted-foreground">{f.submodule}</p>
                      </td>
                      {CORE_ACTIONS.map((a) => {
                        const st = effectiveState(store, reviewUser, f.key, a);
                        const tone = st === "Direct Deny" ? "text-rose-600" : st === "Denied" ? "text-muted-foreground/40" : "text-emerald-600";
                        return <td key={a} className={`px-2 text-center text-[11px] font-medium ${tone}`}>{st === "Denied" ? "—" : st}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <SectionCard title="Permission activity logs" desc={`${permissionEvents.length} recorded permission events`}>
            {permissionEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No permission activity recorded yet.</p>
            ) : (
              <div className="divide-y divide-black/5">
                {permissionEvents.slice(0, 60).map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{e.event.replace(/_/g, " ")}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[e.recordId, e.user, e.newValue, e.reason].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "info"}>{e.severity}</Pill>
                      <span className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <NewRoleDialog open={roleDialog} onOpenChange={setRoleDialog} />
      <AssignRoleDialog open={assignDialog} onOpenChange={setAssignDialog} />
      <DirectPermissionDialog open={directDialog} onOpenChange={setDirectDialog} />
    </div>
  );
}

function NewRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createRole = useRbacStore((s) => s.createRole);
  const [form, setForm] = useState({ name: "", code: "", description: "", type: ROLE_TYPES[1] as string, branchScope: BRANCH_SCOPES[2] as string, terminalScope: TERMINAL_SCOPES[0] as string, recordScope: RECORD_SCOPES[4] as string });

  function submit() {
    if (!form.name.trim() || !form.code.trim()) { toast.error("Role name and code are required."); return; }
    createRole({
      name: form.name.trim(), code: form.code.trim().toUpperCase(), description: form.description,
      type: form.type as RbacRole["type"], branchScope: form.branchScope, branches: [],
      terminalScope: form.terminalScope, terminals: [], recordScope: form.recordScope,
      effectiveFrom: new Date().toISOString().slice(0, 10), status: "Draft", permissions: {},
    });
    toast.success(`${form.name} created as a draft role`);
    setForm({ ...form, name: "", code: "", description: "" });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New role</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Role name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Yard Supervisor" /></div>
            <div><Label className="text-xs">Role code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="YARDSUP" /></div>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <ScopeSelect label="Role type" value={form.type} options={[...ROLE_TYPES]} onChange={(v) => setForm({ ...form, type: v })} />
            <ScopeSelect label="Branch scope" value={form.branchScope} options={[...BRANCH_SCOPES]} onChange={(v) => setForm({ ...form, branchScope: v })} />
            <ScopeSelect label="Terminal scope" value={form.terminalScope} options={[...TERMINAL_SCOPES]} onChange={(v) => setForm({ ...form, terminalScope: v })} />
            <ScopeSelect label="Record scope" value={form.recordScope} options={[...RECORD_SCOPES]} onChange={(v) => setForm({ ...form, recordScope: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit}>Create role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const store = useRbacStore();
  const [form, setForm] = useState({ userName: "", roleId: store.roles[0]?.id ?? "", branchScope: "Riyadh Main Branch", terminalScope: "All Terminals", reason: "", temporary: false, effectiveTo: "" });

  function submit() {
    if (!form.userName.trim()) { toast.error("User name is required."); return; }
    if (form.temporary && !form.effectiveTo) { toast.error("A temporary assignment needs an end date."); return; }
    const duplicate = store.assignments.some((a) => a.userName === form.userName.trim() && a.roleId === form.roleId && a.status === "Active");
    if (duplicate) { toast.error("This user already holds that role."); return; }
    store.assignRole({
      userName: form.userName.trim(), roleId: form.roleId, branchScope: form.branchScope, terminalScope: form.terminalScope,
      effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: form.temporary ? form.effectiveTo : undefined,
      temporary: form.temporary, reason: form.reason || "Role assignment", assignedBy: "System Administrator", status: "Active",
    });
    toast.success("Role assigned");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Assign role to user</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">User</Label><Input value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} placeholder="Sara Al-Otaibi" /></div>
          <ScopeSelect label="Role" value={form.roleId} options={store.roles.map((r) => r.id)} labels={Object.fromEntries(store.roles.map((r) => [r.id, r.name]))} onChange={(v) => setForm({ ...form, roleId: v })} />
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Branch scope</Label><Input value={form.branchScope} onChange={(e) => setForm({ ...form, branchScope: e.target.value })} /></div>
            <div><Label className="text-xs">Terminal scope</Label><Input value={form.terminalScope} onChange={(e) => setForm({ ...form, terminalScope: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.temporary} onCheckedChange={(v) => setForm({ ...form, temporary: Boolean(v) })} /> Temporary assignment
          </label>
          {form.temporary && <div><Label className="text-xs">Effective to</Label><Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>}
          <div><Label className="text-xs">Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit}><UserCog className="mr-1.5 h-4 w-4" />Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DirectPermissionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const store = useRbacStore();
  const [form, setForm] = useState({ userName: "", featureKey: PERMISSION_CATALOG[0].key, action: "Read" as PermissionActionKey, mode: "Allow", branch: "Riyadh Main Branch", terminal: "-", reason: "", requestedBy: "Ahmed Al-Harbi" });

  function submit() {
    if (!form.userName.trim() || !form.reason.trim()) { toast.error("User and reason are required for a direct permission."); return; }
    store.addDirect({
      userName: form.userName.trim(), featureKey: form.featureKey, action: form.action, mode: form.mode as "Allow" | "Deny",
      branch: form.branch, terminal: form.terminal, effectiveFrom: new Date().toISOString().slice(0, 10),
      reason: form.reason, requestedBy: form.requestedBy,
    });
    toast.success("Access request submitted for approval");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Request direct permission</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">User</Label><Input value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} /></div>
          <ScopeSelect
            label="Feature" value={form.featureKey}
            options={PERMISSION_CATALOG.map((f) => f.key)}
            labels={Object.fromEntries(PERMISSION_CATALOG.map((f) => [f.key, `${f.module} · ${f.feature}`]))}
            onChange={(v) => setForm({ ...form, featureKey: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <ScopeSelect label="Action" value={form.action} options={[...PERMISSION_ACTIONS]} onChange={(v) => setForm({ ...form, action: v as PermissionActionKey })} />
            <ScopeSelect label="Mode" value={form.mode} options={["Allow", "Deny"]} onChange={(v) => setForm({ ...form, mode: v })} />
            <div><Label className="text-xs">Branch</Label><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
            <div><Label className="text-xs">Requested by</Label><Input value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })} /></div>
          </div>
          <div><Label className="text-xs">Business justification</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Maker-Checker: this request must be approved by someone other than the requester.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {options.map((o) => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
