import { useMemo, useState } from "react";
import { Copy, Plus, Trash2, FlaskConical, Save, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { SearchSelect, MultiSearchSelect, type SearchOption } from "@/components/buildpos/SearchSelect";
import {
  ACTION_TYPES, BRANCHES, LIST_OPERATORS, NO_VALUE_OPERATORS, RANGE_OPERATORS, RULE_CATEGORIES,
  TRIGGER_EVENTS, dataPointById, dataPointsForEvent, operatorsFor, valueOptions,
} from "@/lib/rules/registry";
import {
  describeRule, emptyGroup, newCondition, uid, useRuleStore,
  type Condition, type ConditionGroup, type Rule, type RuleAction,
} from "@/lib/rules/store";
import { ROLES, useApprovalStore } from "@/lib/approvals/store";

const opt = (v: string): SearchOption => ({ value: v, label: v });

function replaceNode(group: ConditionGroup, id: string, fn: (node: Condition | ConditionGroup) => (Condition | ConditionGroup) | null): ConditionGroup {
  return {
    ...group,
    children: group.children.flatMap((child) => {
      if (child.id === id) {
        const next = fn(child);
        return next ? [next] : [];
      }
      if (child.kind === "group") return [replaceNode(child, id, fn)];
      return [child];
    }),
  };
}
function addToGroup(group: ConditionGroup, groupId: string, node: Condition | ConditionGroup): ConditionGroup {
  if (group.id === groupId) return { ...group, children: [...group.children, node] };
  return { ...group, children: group.children.map((c) => (c.kind === "group" ? addToGroup(c, groupId, node) : c)) };
}
function moveInGroup(group: ConditionGroup, id: string, dir: -1 | 1): ConditionGroup {
  const idx = group.children.findIndex((c) => c.id === id);
  if (idx >= 0) {
    const next = [...group.children];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return group;
    [next[idx], next[target]] = [next[target], next[idx]];
    return { ...group, children: next };
  }
  return { ...group, children: group.children.map((c) => (c.kind === "group" ? moveInGroup(c, id, dir) : c)) };
}
function collectConditions(group: ConditionGroup): Condition[] {
  return group.children.flatMap((c) => (c.kind === "group" ? collectConditions(c) : [c]));
}

export function RuleBuilder({ rule, onDone }: { rule: Rule; onDone: () => void }) {
  const [draft, setDraft] = useState<Rule>(rule);
  const saveRule = useRuleStore((s) => s.saveRule);
  const runTest = useRuleStore((s) => s.runTest);
  const rollback = useRuleStore((s) => s.rollback);
  const logs = useRuleStore((s) => s.logs).filter((l) => l.ruleId === draft.id);
  const users = useApprovalStore((s) => s.users);
  const currentUserId = useApprovalStore((s) => s.currentUserId);
  const actor = users.find((u) => u.id === currentUserId)?.name ?? "System";

  const [sample, setSample] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<ReturnType<typeof runTest> | null>(null);

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dpOptions: SearchOption[] = useMemo(
    () => dataPointsForEvent(draft.triggerEvent).map((d) => ({ value: d.id, label: d.label, group: d.module, hint: d.field })),
    [draft.triggerEvent]
  );
  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  const conditions = collectConditions(draft.conditions);

  function updateGroup(next: ConditionGroup) {
    set("conditions", next);
  }

  function renderGroup(group: ConditionGroup, depth: number) {
    return (
      <div key={group.id} className={`rounded-xl border p-3 ${depth ? "border-brand/30 bg-brand/[0.03]" : "border-black/10 bg-black/[0.02]"}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-black/10">
            {(["AND", "OR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateGroup(depth === 0 ? { ...draft.conditions, combinator: c } : replaceNode(draft.conditions, group.id, (n) => ({ ...(n as ConditionGroup), combinator: c })))}
                className={`px-3 py-1 text-xs font-semibold ${group.combinator === c ? "bg-brand text-brand-foreground" : "bg-white text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => updateGroup(addToGroup(draft.conditions, group.id, newCondition()))}>
            <Plus className="h-3.5 w-3.5" /> Condition
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => updateGroup(addToGroup(draft.conditions, group.id, emptyGroup()))}>
            <Plus className="h-3.5 w-3.5" /> Nested group
          </Button>
          {depth > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-critical" onClick={() => updateGroup(replaceNode(draft.conditions, group.id, () => null))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {group.children.length === 0 && <p className="text-xs text-muted-foreground">No conditions yet — this group always matches.</p>}
          {group.children.map((child) =>
            child.kind === "group" ? renderGroup(child, depth + 1) : renderCondition(child)
          )}
        </div>
      </div>
    );
  }

  function renderCondition(c: Condition) {
    const dp = dataPointById(c.dataPointId);
    const ops = operatorsFor(dp);
    const options = valueOptions(dp, { roles: [...ROLES], users: users.map((u) => u.name) });
    const needsValue = !NO_VALUE_OPERATORS.includes(c.operator);
    const isRange = RANGE_OPERATORS.includes(c.operator);
    const isList = LIST_OPERATORS.includes(c.operator);
    const patch = (p: Partial<Condition>) => updateGroup(replaceNode(draft.conditions, c.id, (n) => ({ ...(n as Condition), ...p })));

    return (
      <div key={c.id} className="rounded-lg border border-black/10 bg-white p-2.5">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <SearchSelect options={dpOptions} value={c.dataPointId} placeholder="Data point" onChange={(v) => patch({ dataPointId: v, operator: "", value: "" })} />
          <SearchSelect options={ops.map(opt)} value={c.operator} placeholder="Operator" disabled={!dp} onChange={(v) => patch({ operator: v, value: isListOp(v) ? [] : "" })} />
          <div className="space-y-1.5">
            {!needsValue && <p className="pt-2 text-xs text-muted-foreground">No value needed</p>}
            {needsValue && isList && options && (
              <MultiSearchSelect options={options.map(opt)} values={Array.isArray(c.value) ? c.value : []} onChange={(v) => patch({ value: v })} placeholder="Select values" />
            )}
            {needsValue && isList && !options && (
              <Input className="h-9" placeholder="Comma separated" value={String(c.value)} onChange={(e) => patch({ value: e.target.value })} />
            )}
            {needsValue && !isList && options && (
              <SearchSelect options={options.map(opt)} value={String(c.value)} placeholder="Value" onChange={(v) => patch({ value: v })} />
            )}
            {needsValue && !isList && !options && (
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  type={dp?.type === "date" ? "date" : dp?.type === "text" ? "text" : "number"}
                  placeholder={dp?.type === "currency" ? "SAR amount" : dp?.type === "percentage" ? "%" : "Value"}
                  value={String(c.value)}
                  onChange={(e) => patch({ value: e.target.value })}
                />
                {isRange && (
                  <Input className="h-9" type={dp?.type === "date" ? "date" : "number"} placeholder="and" value={c.value2 ?? ""} onChange={(e) => patch({ value2: e.target.value })} />
                )}
              </div>
            )}
          </div>
          <div className="flex items-start gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateGroup(moveInGroup(draft.conditions, c.id, -1))}><ChevronUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateGroup(moveInGroup(draft.conditions, c.id, 1))}><ChevronDown className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateGroup(addToGroup(draft.conditions, draft.conditions.id, { ...c, id: uid() }))}><Copy className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-critical" onClick={() => updateGroup(replaceNode(draft.conditions, c.id, () => null))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {dp && <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{dp.id} · {dp.field} · {dp.type}{dp.sensitive ? " · sensitive" : ""}</p>}
      </div>
    );
  }

  function patchAction(id: string, p: Partial<RuleAction>) {
    set("actions", draft.actions.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }

  function handleTest() {
    const result = runTest(draft, sample, actor, draft.code);
    setTestResult(result);
    if (draft.status === "Draft") set("status", "Tested");
    toast.success(`Test result: ${result.result}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Rule Builder</p>
          <h2 className="font-display text-xl font-bold">{draft.name || "New rule"}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>Close</Button>
          <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => { saveRule(draft, actor, `Saved by ${actor}`); toast.success("Rule saved — new version recorded"); onDone(); }}>
            <Save className="h-4 w-4" /> Save rule
          </Button>
        </div>
      </div>

      <SectionCard title="1 · Rule Information">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Rule Name"><Input className="h-9" value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Rule Code"><Input className="h-9 font-mono" value={draft.code} onChange={(e) => set("code", e.target.value)} /></Field>
          <Field label="Rule Category"><SearchSelect options={RULE_CATEGORIES.map(opt)} value={draft.category} onChange={(v) => set("category", v)} /></Field>
          <Field label="Priority"><Input className="h-9" type="number" value={draft.priority} onChange={(e) => set("priority", Number(e.target.value))} /></Field>
          <Field label="Scope"><SearchSelect options={["All Branches", "Selected Branches"].map(opt)} value={draft.scope} onChange={(v) => set("scope", v as Rule["scope"])} /></Field>
          <Field label="Status"><SearchSelect options={["Draft", "Tested", "Pending Approval", "Active", "Inactive", "Expired", "Rejected"].map(opt)} value={draft.status} onChange={(v) => set("status", v as Rule["status"])} /></Field>
          {draft.scope === "Selected Branches" && (
            <Field label="Applicable Branches" className="md:col-span-3">
              <MultiSearchSelect options={BRANCHES.map(opt)} values={draft.branches} onChange={(v) => set("branches", v)} />
            </Field>
          )}
          <Field label="Effective From"><Input className="h-9" type="date" value={draft.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
          <Field label="Effective To"><Input className="h-9" type="date" value={draft.effectiveTo ?? ""} onChange={(e) => set("effectiveTo", e.target.value)} /></Field>
          <Field label="Description" className="md:col-span-3"><Textarea rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="2 · Trigger Event" desc="WHEN — pick the module event that starts this rule.">
        <SearchSelect
          className="max-w-xl"
          options={TRIGGER_EVENTS.map((e) => ({ value: e.id, label: e.label, group: e.group }))}
          value={draft.triggerEvent}
          placeholder="Select trigger event"
          onChange={(v) => set("triggerEvent", v)}
        />
      </SectionCard>

      <SectionCard title="3 · Conditions" desc="IF — data points come from the backend registry; nothing is typed by hand.">
        {renderGroup(draft.conditions, 0)}
        <p className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-sm text-foreground">{describeRule(draft)}</p>
      </SectionCard>

      <SectionCard
        title="4 · Actions"
        desc="THEN — what the engine does when every condition matches."
        action={<Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => set("actions", [...draft.actions, { id: uid(), type: "Show Warning" }])}><Plus className="h-3.5 w-3.5" /> Action</Button>}
      >
        <div className="space-y-2">
          {draft.actions.map((a) => (
            <div key={a.id} className="grid gap-2 rounded-lg border border-black/10 bg-white p-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <SearchSelect options={ACTION_TYPES.map(opt)} value={a.type} onChange={(v) => patchAction(a.id, { type: v })} />
              {a.type === "Assign Approval to Role" || a.type === "Notify Role" ? (
                <SearchSelect options={ROLES.map(opt)} value={a.role ?? ""} placeholder="Role" onChange={(v) => patchAction(a.id, { role: v })} />
              ) : a.type === "Assign Approval to User" || a.type === "Notify User" ? (
                <SearchSelect options={userOptions} value={a.userId ?? ""} placeholder="User" onChange={(v) => patchAction(a.id, { userId: v })} />
              ) : a.type === "Apply Discount" || a.type === "Apply Restocking Fee" ? (
                <Input className="h-9" type="number" placeholder="Percentage" value={a.amount ?? ""} onChange={(e) => patchAction(a.id, { amount: e.target.value })} />
              ) : a.type === "Set Priority" ? (
                <SearchSelect options={["Low", "Normal", "High", "Urgent"].map(opt)} value={a.priority ?? ""} onChange={(v) => patchAction(a.id, { priority: v })} />
              ) : (
                <Input className="h-9" placeholder="Message shown to the user" value={a.message ?? ""} onChange={(e) => patchAction(a.id, { message: e.target.value })} />
              )}
              <Button size="icon" variant="ghost" className="h-9 w-9 text-critical" onClick={() => set("actions", draft.actions.filter((x) => x.id !== a.id))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!draft.actions.length && <p className="text-xs text-muted-foreground">No actions configured yet.</p>}
        </div>
      </SectionCard>

      <SectionCard title="5 · Approval Routing" desc="Who signs off when this rule demands approval.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Approval Mode">
            <SearchSelect options={["No Approval", "Role-Based", "User-Based", "Approval Workflow"].map(opt)} value={draft.approval.mode} onChange={(v) => set("approval", { ...draft.approval, mode: v as Rule["approval"]["mode"] })} />
          </Field>
          {draft.approval.mode === "Role-Based" && (
            <>
              <Field label="Checker Role"><SearchSelect options={ROLES.map(opt)} value={draft.approval.role ?? ""} onChange={(v) => set("approval", { ...draft.approval, role: v })} /></Field>
              <Field label="Fallback Role"><SearchSelect options={ROLES.map(opt)} value={draft.approval.fallbackRole ?? ""} onChange={(v) => set("approval", { ...draft.approval, fallbackRole: v })} /></Field>
            </>
          )}
          {draft.approval.mode === "User-Based" && (
            <Field label="Approver"><SearchSelect options={userOptions} value={draft.approval.userId ?? ""} onChange={(v) => set("approval", { ...draft.approval, userId: v })} /></Field>
          )}
          {draft.approval.mode === "Approval Workflow" && (
            <>
              <Field label="Workflow Type"><SearchSelect options={["Sequential", "Parallel"].map(opt)} value={draft.approval.workflowType ?? "Sequential"} onChange={(v) => set("approval", { ...draft.approval, workflowType: v as "Sequential" | "Parallel" })} /></Field>
              <Field label="Levels" className="md:col-span-3">
                <div className="space-y-2">
                  {(draft.approval.levels ?? []).map((l, i) => (
                    <div key={l.level} className="flex items-center gap-2">
                      <span className="w-16 text-xs text-muted-foreground">Level {l.level}</span>
                      <SearchSelect
                        className="max-w-xs"
                        options={ROLES.map(opt)}
                        value={l.role}
                        onChange={(v) => set("approval", { ...draft.approval, levels: (draft.approval.levels ?? []).map((x, j) => (j === i ? { ...x, role: v } : x)) })}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-critical" onClick={() => set("approval", { ...draft.approval, levels: (draft.approval.levels ?? []).filter((_, j) => j !== i).map((x, j) => ({ ...x, level: j + 1 })) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => set("approval", { ...draft.approval, levels: [...(draft.approval.levels ?? []), { level: (draft.approval.levels?.length ?? 0) + 1, role: "Store Manager" }] })}>
                    <Plus className="h-3.5 w-3.5" /> Add level
                  </Button>
                </div>
              </Field>
            </>
          )}
          <Field label="PIN required at approval">
            <div className="flex h-9 items-center"><Switch checked={draft.approval.pinRequired ?? false} onCheckedChange={(v) => set("approval", { ...draft.approval, pinRequired: v })} /></div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="6 · Test Rule" desc="Enter sample values for the data points used above, then run the rule.">
        <div className="grid gap-3 md:grid-cols-2">
          {conditions.filter((c) => c.dataPointId).map((c) => {
            const dp = dataPointById(c.dataPointId)!;
            const options = valueOptions(dp, { roles: [...ROLES], users: users.map((u) => u.name) });
            return (
              <Field key={c.id} label={`${dp.label} (${dp.type})`}>
                {dp.type === "boolean" ? (
                  <SearchSelect options={["Yes", "No"].map((v) => ({ value: v === "Yes" ? "true" : "false", label: v }))} value={sample[dp.id] ?? ""} onChange={(v) => setSample((s) => ({ ...s, [dp.id]: v }))} />
                ) : options ? (
                  <SearchSelect options={options.map(opt)} value={sample[dp.id] ?? ""} onChange={(v) => setSample((s) => ({ ...s, [dp.id]: v }))} />
                ) : (
                  <Input className="h-9" type={dp.type === "date" ? "date" : dp.type === "text" ? "text" : "number"} value={sample[dp.id] ?? ""} onChange={(e) => setSample((s) => ({ ...s, [dp.id]: e.target.value }))} />
                )}
              </Field>
            );
          })}
        </div>
        <Button size="sm" className="mt-3 gap-1.5" onClick={handleTest}><FlaskConical className="h-4 w-4" /> Run test</Button>
        {testResult && (
          <div className="mt-3 space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Result</span>
              <Pill tone={testResult.result === "Blocked" ? "critical" : testResult.result === "Passed" ? "success" : testResult.result === "No Match" ? "muted" : "warning"}>{testResult.result}</Pill>
            </div>
            <p><span className="text-muted-foreground">Matched:</span> {testResult.matched.join(" · ") || "none"}</p>
            <p><span className="text-muted-foreground">Unmatched:</span> {testResult.unmatched.join(" · ") || "none"}</p>
            <p><span className="text-muted-foreground">Actions:</span> {testResult.actions.join(", ") || "none"}</p>
            <p><span className="text-muted-foreground">Approvers:</span> {testResult.approvers.join(" · ") || "none"}</p>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="7 · Version History">
          <div className="space-y-2 text-sm">
            {draft.versions.length === 0 && <p className="text-xs text-muted-foreground">No versions yet — save the rule to create v1.</p>}
            {draft.versions.map((v) => (
              <div key={v.version} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-2.5">
                <div>
                  <p className="font-medium">v{v.version} · {v.author}</p>
                  <p className="text-xs text-muted-foreground">{new Date(v.ts).toLocaleString()} — {v.note}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => { rollback(draft.id, v.version, actor); toast.success(`Rolled back to v${v.version}`); onDone(); }}>Rollback</Button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="8 · Execution Logs">
          <div className="space-y-2 text-sm">
            {logs.length === 0 && <p className="text-xs text-muted-foreground">No executions recorded for this rule yet.</p>}
            {logs.slice(0, 8).map((l) => (
              <div key={l.id} className="rounded-lg border border-black/10 bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{l.id}</span>
                  <Pill tone={l.result === "Blocked" ? "critical" : l.result === "Passed" ? "success" : l.result === "No Match" ? "muted" : "warning"}>{l.mode} · {l.result}</Pill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(l.ts).toLocaleString()} · {l.actor} · {l.actions.join(", ") || "no actions"}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function isListOp(op: string) {
  return LIST_OPERATORS.includes(op);
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}