import { useMemo, useState } from "react";
import { Plus, Power, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/buildpos/SearchSelect";
import { RuleBuilder } from "./RuleBuilder";
import { DATA_POINTS, RULE_CATEGORIES, eventById } from "@/lib/rules/registry";
import { emptyGroup, newCondition, uid, useRuleStore, type Rule } from "@/lib/rules/store";
import { useApprovalStore } from "@/lib/approvals/store";
import type { Severity } from "@/lib/buildpos/format";

function statusTone(s: string): Severity {
  if (s === "Active") return "success";
  if (s === "Rejected" || s === "Expired") return "critical";
  if (s === "Pending Approval" || s === "Tested") return "warning";
  if (s === "Inactive") return "muted";
  return "info";
}

function blankRule(): Rule {
  return {
    id: `RULE-${Date.now().toString(36).toUpperCase()}`,
    code: `RULE-NEW-${String(Math.floor(Math.random() * 900) + 100)}`,
    name: "",
    category: "Sales",
    description: "",
    priority: 50,
    scope: "All Branches",
    branches: [],
    effectiveFrom: new Date().toISOString().slice(0, 10),
    status: "Draft",
    triggerEvent: "",
    conditions: { ...emptyGroup(), children: [newCondition()] },
    actions: [{ id: uid(), type: "Show Warning", message: "" }],
    approval: { mode: "No Approval" },
    version: 0,
    versions: [],
    updatedAt: Date.now(),
  };
}

export function RulesEnginePage() {
  const rules = useRuleStore((s) => s.rules);
  const logs = useRuleStore((s) => s.logs);
  const setStatus = useRuleStore((s) => s.setStatus);
  const users = useApprovalStore((s) => s.users);
  const currentUserId = useApprovalStore((s) => s.currentUserId);
  const actor = users.find((u) => u.id === currentUserId)?.name ?? "System";

  const [editing, setEditing] = useState<Rule | null>(null);
  const [category, setCategory] = useState("");
  const [status, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [registrySearch, setRegistrySearch] = useState("");
  const [registryModule, setRegistryModule] = useState("");

  const filtered = useMemo(
    () =>
      rules
        .filter((r) => !category || r.category === category)
        .filter((r) => !status || r.status === status)
        .filter((r) => !search || `${r.name} ${r.code} ${r.description}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.priority - b.priority),
    [rules, category, status, search]
  );

  const registry = useMemo(
    () =>
      DATA_POINTS.filter((d) => !registryModule || d.module === registryModule).filter(
        (d) => !registrySearch || `${d.label} ${d.field} ${d.id}`.toLowerCase().includes(registrySearch.toLowerCase())
      ),
    [registryModule, registrySearch]
  );

  if (editing) return <div className="space-y-4"><RuleBuilder rule={editing} onDone={() => setEditing(null)} /></div>;

  return (
    <div className="space-y-4">
      <PageHeader
        group="Admin"
        title="Rules Engine"
        desc="Backend-registered data points, typed operators, condition groups, actions and approval routing — every rule testable before it goes live."
        primary="New rule"
        onPrimary={() => setEditing(blankRule())}
      />
      <KpiGrid
        scope="rules"
        items={[
          { label: "Total Rules", value: rules.length },
          { label: "Active", value: rules.filter((r) => r.status === "Active").length, tone: "success" },
          { label: "Draft / Tested", value: rules.filter((r) => r.status === "Draft" || r.status === "Tested").length, tone: "warning" },
          { label: "Data Points", value: DATA_POINTS.length, sub: "registry", tone: "info" },
          { label: "Executions Logged", value: logs.length, tone: "info" },
          { label: "Blocked Results", value: logs.filter((l) => l.result === "Blocked").length, tone: "critical" },
        ]}
      />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="registry">Data Point Registry</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <SectionCard
            title="Configured rules"
            desc="Priority order is the execution order. Processing stops at the first matched blocking rule."
            action={
              <div className="flex flex-wrap gap-2">
                <SearchSelect className="w-48" options={[{ value: "", label: "All categories" }, ...RULE_CATEGORIES.map((c) => ({ value: c, label: c }))]} value={category} onChange={setCategory} placeholder="Category" />
                <SearchSelect className="w-40" options={[{ value: "", label: "All statuses" }, ...["Draft", "Tested", "Pending Approval", "Active", "Inactive", "Expired", "Rejected"].map((s) => ({ value: s, label: s }))]} value={status} onChange={setStatusFilter} placeholder="Status" />
                <Input className="h-9 w-56" placeholder="Search rules…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          >
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Rule Code", "Name", "Category", "Trigger Event", "Priority", "Version", "Status", "Actions"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="min-w-[14rem]">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.category}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{eventById(r.triggerEvent)?.label ?? "—"}</TableCell>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>v{r.version}</TableCell>
                      <TableCell><Pill tone={statusTone(r.status)}>{r.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}>Open</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1"
                            onClick={() => {
                              const next = r.status === "Active" ? "Inactive" : "Active";
                              setStatus(r.id, next, actor);
                              toast.success(`${r.code} is now ${next}`);
                            }}
                          >
                            <Power className="h-3.5 w-3.5" /> {r.status === "Active" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No rules match these filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="registry" className="mt-4">
          <SectionCard
            title="Data Point Registry"
            desc="The backend metadata every rule condition is built from — ID, module, backend field, type, allowed operators and value source."
            action={
              <div className="flex flex-wrap gap-2">
                <SearchSelect className="w-52" options={[{ value: "", label: "All modules" }, ...Array.from(new Set(DATA_POINTS.map((d) => d.module))).map((m) => ({ value: m, label: m }))]} value={registryModule} onChange={setRegistryModule} placeholder="Module" />
                <Input className="h-9 w-56" placeholder="Search data points…" value={registrySearch} onChange={(e) => setRegistrySearch(e.target.value)} />
              </div>
            }
          >
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Data Point ID", "Module", "Label", "Backend Field", "Data Type", "Value Source", "Sensitive", "Status"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registry.slice(0, 200).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{d.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.module}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.label}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{d.field}</TableCell>
                      <TableCell className="whitespace-nowrap capitalize">{d.type}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{d.valueSource}</TableCell>
                      <TableCell>{d.sensitive ? <Pill tone="warning">Sensitive</Pill> : "—"}</TableCell>
                      <TableCell><Pill tone={d.active ? "success" : "muted"}>{d.active ? "Active" : "Inactive"}</Pill></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <SectionCard title="Execution Logs" desc="Every test and live evaluation, with matched conditions, triggered actions and selected approvers.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Log ID", "Rule", "Mode", "Result", "Matched", "Unmatched", "Actions", "Approvers", "When"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{l.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.ruleName}</TableCell>
                      <TableCell><Pill tone={l.mode === "Test" ? "info" : "muted"}>{l.mode}</Pill></TableCell>
                      <TableCell><Pill tone={l.result === "Blocked" ? "critical" : l.result === "Passed" ? "success" : l.result === "No Match" ? "muted" : "warning"}>{l.result}</Pill></TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs">{l.matched.join(" · ") || "—"}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs">{l.unmatched.join(" · ") || "—"}</TableCell>
                      <TableCell className="text-xs">{l.actions.join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">{l.approvers.join(" · ") || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(l.ts).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!logs.length && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        <FlaskConical className="mx-auto mb-2 h-5 w-5 opacity-40" />
                        No executions yet — open a rule and run a test.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Plus className="h-3 w-3" /> Rules, versions and logs persist locally and survive a refresh.</p>
    </div>
  );
}