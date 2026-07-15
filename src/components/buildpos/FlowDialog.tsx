import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Field, Flow } from "@/lib/buildpos/flows";

function FieldControl({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const base =
    "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        className={`${base} min-h-[84px] py-2`}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "toggle") {
    const on = value === "on";
    return (
      <button
        type="button"
        onClick={() => onChange(on ? "" : "on")}
        className={`inline-flex h-8 w-14 items-center rounded-full border transition ${
          on ? "border-brand/40 bg-brand" : "border-black/10 bg-canvas"
        }`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white shadow transition ${on ? "translate-x-7" : "translate-x-1"}`}
        />
      </button>
    );
  }
  if (field.type === "tags") {
    return (
      <input
        className={base}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      className={base}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FlowDialog({
  flow,
  open,
  onOpenChange,
}: {
  flow: Flow | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const steps = flow?.steps ?? [];
  const isReview = step === steps.length;
  const total = steps.length + 1; // + review

  const summary = useMemo(() => {
    return steps.flatMap((s) =>
      s.fields
        .map((f) => ({ label: f.label, val: values[f.name] }))
        .filter((x) => x.val && x.val.trim().length > 0),
    );
  }, [steps, values]);

  function reset() {
    setStep(0);
    setValues({});
    setDone(false);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  function save() {
    setDone(true);
    toast.success(flow?.successTitle ?? `${flow?.title} saved`, {
      description: flow?.successMsg ?? "Mock data recorded — not connected to a live backend yet.",
    });
    setTimeout(() => handleClose(false), 900);
  }

  if (!flow) return null;
  const Icon = flow.icon;
  const current = steps[step];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl"
      >
        <div className="grid md:grid-cols-[220px_1fr]">
          {/* Stepper rail */}
          <div className="relative hidden bg-sidebar-bg p-5 text-sidebar-fg md:block">
            <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-40" />
            <div className="relative">
              <div className="mb-5 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Flow</p>
                  <p className="text-sm font-semibold">{flow.title}</p>
                </div>
              </div>
              <ol className="space-y-1">
                {steps.map((s, i) => {
                  const state = i < step ? "done" : i === step && !isReview ? "current" : "todo";
                  return (
                    <li key={s.name}>
                      <button
                        type="button"
                        onClick={() => i <= step && setStep(i)}
                        disabled={i > step}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                          state === "current"
                            ? "bg-white/10 text-white"
                            : state === "done"
                            ? "text-white/80 hover:bg-white/5"
                            : "text-white/40"
                        }`}
                      >
                        <span
                          className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                            state === "done"
                              ? "bg-success text-success-foreground"
                              : state === "current"
                              ? "bg-white text-brand"
                              : "bg-white/10 text-white/60"
                          }`}
                        >
                          {state === "done" ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                        <span className="truncate font-medium">{s.name}</span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <div
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                      isReview ? "bg-white/10 text-white" : "text-white/40"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                        isReview ? "bg-white text-brand" : "bg-white/10 text-white/60"
                      }`}
                    >
                      {steps.length + 1}
                    </span>
                    <span className="font-medium">Review</span>
                  </div>
                </li>
              </ol>
              <p className="mt-6 text-[11px] leading-relaxed text-white/50">
                {flow.subtitle}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="relative flex max-h-[80vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-black/5 px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                  Step {Math.min(step + 1, total)} of {total}
                </p>
                <h2 className="font-display text-lg font-bold text-foreground">
                  {isReview ? "Review & confirm" : current?.name}
                </h2>
                {!isReview && current?.desc && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{current.desc}</p>
                )}
              </div>
              <button
                onClick={() => handleClose(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {done ? (
                <div className="grid place-items-center py-10 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success bp-enter">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold">{flow.successTitle ?? "Saved"}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{flow.successMsg ?? "Recorded successfully."}</p>
                </div>
              ) : isReview ? (
                <div className="rounded-xl border border-black/5 bg-canvas p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-brand">
                    <Sparkles className="h-3.5 w-3.5" /> Ready to submit
                  </div>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
                    {summary.length === 0 && (
                      <p className="text-sm text-muted-foreground">No fields captured. Go back and fill in details.</p>
                    )}
                    {summary.map((s) => (
                      <div key={s.label} className="flex flex-col rounded-lg bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,10,50,0.03)]">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {s.label}
                        </dt>
                        <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                          {s.val === "on" ? "Enabled" : s.val}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {current?.fields.map((f) => (
                    <div key={f.name} className={f.full ? "md:col-span-2" : ""}>
                      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {f.label}
                        {f.required && <span className="text-critical">*</span>}
                      </label>
                      <FieldControl
                        field={f}
                        value={values[f.name] ?? f.default ?? ""}
                        onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
                      />
                      {f.hint && <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || done}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                {isReview ? (
                  <Button
                    size="sm"
                    onClick={save}
                    disabled={done}
                    className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    <Check className="h-4 w-4" /> Save {flow.title}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setStep((s) => s + 1)}
                    className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}