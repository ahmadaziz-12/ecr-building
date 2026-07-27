import { useState } from "react";
import { Boxes, Check, ChevronDown, Handshake, Percent, Sparkles, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBranches } from "@/lib/api/admin";
import { useProducts } from "@/lib/api/catalog";
import { useCreatePricingRule, type UpsertPricingRuleRequest } from "@/lib/api/pos";

type RuleKind = "Trade Tier" | "Quantity" | "Coupon" | "Manual";
// "Manual" covers Bundle/Fee/Promo rows — reference-only today (Bundle pricing really lives on
// /stock/bundles, restocking fees in the returns workflow, promos are informational) — kept
// available so the grid can still record them, but visually set apart from the 3 automatic types.
type ManualType = "Bundle" | "Fee" | "Promo";

const KIND_META: Record<RuleKind, { icon: typeof Percent; title: string; blurb: string }> = {
  "Trade Tier": { icon: Handshake, title: "Trade Tier", blurb: "Automatic % off for contractor accounts" },
  Quantity: { icon: Boxes, title: "Quantity Discount", blurb: "Auto-applies once a cart line hits a threshold" },
  Coupon: { icon: Ticket, title: "Coupon Code", blurb: "Customer enters a code at checkout" },
  Manual: { icon: Sparkles, title: "Other / Manual", blurb: "Bundle, fee or promo — recorded for reference" },
};

const inputClass =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function CreatePricingRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: branches } = useBranches(open);
  const { data: products } = useProducts(open);
  const createRule = useCreatePricingRule();

  const [kind, setKind] = useState<RuleKind>("Trade Tier");
  const [manualType, setManualType] = useState<ManualType>("Bundle");
  const [name, setName] = useState("");
  const [valuePct, setValuePct] = useState("");
  const [sku, setSku] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponKind, setCouponKind] = useState<"Percentage" | "Fixed">("Percentage");
  const [couponValue, setCouponValue] = useState("");
  const [manualScope, setManualScope] = useState("");
  const [manualCondition, setManualCondition] = useState("");
  const [manualAction, setManualAction] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [branchName, setBranchName] = useState("All Branches");
  const [priority, setPriority] = useState("10");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setKind("Trade Tier"); setManualType("Bundle"); setName(""); setValuePct(""); setSku("");
    setMinQuantity(""); setCouponCode(""); setCouponKind("Percentage"); setCouponValue("");
    setManualScope(""); setManualCondition(""); setManualAction(""); setAdvancedOpen(false);
    setBranchName("All Branches"); setPriority("10"); setValidUntil("");
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  const product = products?.find((p) => p.sku === sku);

  // What this rule actually does, in plain language — shown live so the person creating it can
  // check their own work before saving, instead of decoding a "-8%" / ">= 50 bags" string later.
  const preview: string | null = (() => {
    if (kind === "Trade Tier") {
      const pct = Number(valuePct);
      if (!pct) return null;
      return `Every Contractor customer automatically gets ${pct}% off${branchName === "All Branches" ? ", at every branch" : ` at ${branchName}`}.`;
    }
    if (kind === "Quantity") {
      const pct = Number(valuePct);
      const qty = Number(minQuantity);
      if (!pct || !qty) return null;
      return `Once a customer buys ${qty}+ units of ${sku ? `${sku}${product ? ` (${product.nameEn})` : ""}` : "any product"} in one line, they automatically get ${pct}% off that line.`;
    }
    if (kind === "Coupon") {
      const val = Number(couponValue);
      if (!couponCode || !val) return null;
      return `A customer who enters code "${couponCode.toUpperCase()}" at checkout gets ${couponKind === "Percentage" ? `${val}% off their order` : `${val} ر.س off their order`}.`;
    }
    if (!manualScope && !manualCondition && !manualAction) return null;
    return `Recorded for staff reference — ${[manualScope, manualCondition, manualAction].filter(Boolean).join(" · ")}. This type isn't auto-applied at checkout yet.`;
  })();

  const canSave =
    !saving &&
    !!name.trim() &&
    (kind === "Trade Tier" ? Number(valuePct) > 0
      : kind === "Quantity" ? Number(valuePct) > 0 && Number(minQuantity) > 0
      : kind === "Coupon" ? !!couponCode.trim() && Number(couponValue) > 0
      : !!manualAction.trim());

  async function handleSave() {
    const branch = branchName !== "All Branches" ? branches?.find((b) => b.nameEn === branchName) : undefined;
    const base = {
      name: name.trim(),
      priority: Number(priority) || 10,
      validUntil: validUntil || null,
      branchId: branch?.id ?? null,
    };

    let request: UpsertPricingRuleRequest;
    if (kind === "Trade Tier") {
      const pct = Number(valuePct);
      request = {
        ...base, type: "Trade Tier", scope: "Contractor customers", condition: "Any",
        action: `-${pct}% list`, code: null, discountType: "Percentage", value: pct,
      };
    } else if (kind === "Quantity") {
      const pct = Number(valuePct);
      const qty = Number(minQuantity);
      request = {
        ...base, type: "Quantity", scope: sku ? `SKU: ${sku}` : "All products", condition: `>= ${qty} units`,
        action: `-${pct}%`, code: null, discountType: "Percentage", value: pct, minQuantity: qty, sku: sku || null,
      };
    } else if (kind === "Coupon") {
      const val = Number(couponValue);
      request = {
        ...base, type: "Coupon", scope: branchName === "All Branches" ? "All branches" : branchName,
        condition: `Code: ${couponCode.toUpperCase()}`,
        action: couponKind === "Percentage" ? `${val}% off` : `${val} ر.س off`,
        code: couponCode.toUpperCase(), discountType: couponKind, value: val,
      };
    } else {
      request = {
        ...base, type: manualType, scope: manualScope || "—", condition: manualCondition || "Any",
        action: manualAction, code: null, discountType: "Percentage", value: 0,
      };
    }

    setSaving(true);
    try {
      await createRule.mutateAsync(request);
      toast.success("Pricing rule created", { description: "Sent for manager approval before it goes live." });
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the rule — check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-black/5 px-6 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">Finance · Pricing</p>
              <h2 className="font-display text-lg font-bold text-foreground">Create Pricing Rule</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pick what kind of discount this is — the form adjusts to match.</p>
            </div>
            <button
              onClick={() => handleClose(false)}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Type picker — 3 automatic types front and center, "manual" set apart */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["Trade Tier", "Quantity", "Coupon"] as const).map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active ? "border-brand bg-brand/5 ring-2 ring-brand/15" : "border-black/10 bg-white hover:border-brand/30"
                    }`}
                  >
                    <div className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-brand text-brand-foreground" : "bg-canvas text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{meta.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{meta.blurb}</p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setKind(kind === "Manual" ? "Trade Tier" : "Manual")}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                kind === "Manual" ? "border-brand bg-brand/5" : "border-dashed border-black/15 text-muted-foreground hover:border-brand/30"
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Other rule type (Bundle, Restocking Fee, Promo) — recorded for reference only
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition ${kind === "Manual" ? "rotate-180" : ""}`} />
            </button>

            {/* Name — common to every type */}
            <div>
              <label className={labelClass}>Rule name</label>
              <input
                className={inputClass}
                placeholder={
                  kind === "Trade Tier" ? "e.g. Contractor Trade Price"
                  : kind === "Quantity" ? "e.g. Cement Pallet Deal"
                  : kind === "Coupon" ? "e.g. Ramadan Promo 2026"
                  : "e.g. Basement Waterproof Kit"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {kind === "Trade Tier" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4">
                <label className={labelClass}>Discount for every Contractor account</label>
                <div className="relative w-40">
                  <input
                    type="number" min={0} max={100} step={0.5}
                    className={`${inputClass} pr-8`}
                    placeholder="12"
                    value={valuePct}
                    onChange={(e) => setValuePct(e.target.value)}
                  />
                  <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Applies automatically at checkout to any customer whose account is set to "Contractor" — no manual action needed.</p>
              </div>
            )}

            {kind === "Quantity" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Product (optional)</label>
                    <select className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)}>
                      <option value="">Any product</option>
                      {products?.map((p) => (
                        <option key={p.id} value={p.sku}>{p.sku} — {p.nameEn}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Minimum quantity</label>
                    <input
                      type="number" min={1} className={inputClass} placeholder="50"
                      value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Discount once that quantity is reached</label>
                  <div className="relative w-40">
                    <input
                      type="number" min={0} max={100} step={0.5} className={`${inputClass} pr-8`} placeholder="8"
                      value={valuePct} onChange={(e) => setValuePct(e.target.value)}
                    />
                    <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            )}

            {kind === "Coupon" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div>
                  <label className={labelClass}>Coupon code</label>
                  <input
                    className={`${inputClass} font-mono uppercase tracking-wider`}
                    placeholder="SAVE20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Discount type</label>
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-black/10 bg-white p-1">
                      {(["Percentage", "Fixed"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCouponKind(t)}
                          className={`h-9 rounded-lg text-xs font-semibold transition ${
                            couponKind === t ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-canvas"
                          }`}
                        >
                          {t === "Percentage" ? "% Off" : "SAR Off"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{couponKind === "Percentage" ? "Percent off" : "Amount off (ر.س)"}</label>
                    <input
                      type="number" min={0} className={inputClass} placeholder={couponKind === "Percentage" ? "10" : "20"}
                      value={couponValue} onChange={(e) => setCouponValue(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {kind === "Manual" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(["Bundle", "Fee", "Promo"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setManualType(t)}
                      className={`h-9 rounded-lg border text-xs font-semibold transition ${
                        manualType === t ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white text-muted-foreground hover:border-brand/30"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div>
                  <label className={labelClass}>Applies to (scope)</label>
                  <input className={inputClass} placeholder="e.g. Waterproofing kit" value={manualScope} onChange={(e) => setManualScope(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Condition</label>
                  <input className={inputClass} placeholder="e.g. Cart matches 80%" value={manualCondition} onChange={(e) => setManualCondition(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>What it gives</label>
                  <input className={inputClass} placeholder="e.g. 150 ر.س off" value={manualAction} onChange={(e) => setManualAction(e.target.value)} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {manualType === "Bundle"
                    ? "Real bundle pricing is set up on Stock → Bundles — this row just cross-references it here for reporting."
                    : manualType === "Fee"
                      ? "Restocking fees are applied during a Surplus Return — this row records the policy for staff to see."
                      : "Promo rows are informational today — staff apply the benefit manually."}
                </p>
              </div>
            )}

            {/* Live preview */}
            {preview && (
              <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3.5">
                <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                <p className="text-sm text-foreground/90">{preview}</p>
              </div>
            )}

            {/* Advanced (branch / priority / valid until) — collapsed by default to keep this simple */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <span>Advanced (branch, priority, expiry)</span>
              <ChevronDown className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/5 bg-canvas/40 p-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Branch</label>
                  <select className={inputClass} value={branchName} onChange={(e) => setBranchName(e.target.value)}>
                    <option value="All Branches">All Branches</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.nameEn}>{b.nameEn}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <input type="number" className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Valid until</label>
                  <input type="date" className={inputClass} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-6 py-3">
            <p className="text-[11px] text-muted-foreground">New rules need a manager's sign-off before they go live.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave}
                className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Check className="h-4 w-4" /> {saving ? "Creating…" : "Create Rule"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
