import { useEffect, useState } from "react";
import { Blocks, Boxes, Check, Handshake, LayoutGrid, Package, Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/buildpos/SearchableSelect";
import { useProducts } from "@/lib/api/catalog";
import { useBranches } from "@/lib/api/admin";
import { useCreateBundle, useUpdateBundle, type BundleDto } from "@/lib/api/bundles";
import { formatSAR } from "@/lib/buildpos/format";
import { CurrencyText } from "@/lib/buildpos/currency";
import { SARIcon } from "@/lib/buildpos/currency";

// Mirrors backend CustomerType (Customer.cs) exactly — the eligibility check compares these literal
// member names, not display labels.
const CUSTOMER_TYPES = [
  { value: "WalkIn", label: "Walk-in" },
  { value: "Retail", label: "Retail" },
  { value: "Contractor", label: "Contractor" },
  { value: "B2B", label: "B2B" },
] as const;

const EFFECTIVE_STATUS_TONE: Record<string, string> = {
  Draft: "bg-black/5 text-muted-foreground",
  "Pending Approval": "bg-warning/15 text-[oklch(0.4_0.13_70)]",
  Scheduled: "bg-info/15 text-info",
  Active: "bg-success/15 text-success",
  Expired: "bg-critical/10 text-critical",
  Disabled: "bg-black/5 text-muted-foreground",
  Archived: "bg-black/5 text-muted-foreground",
};

// BRD §5.1's six commercial bundle shapes (mirrors backend BundleType, Catalog.cs) — Phase 1 only
// records which shape a bundle is; per-type pricing behavior (pallet tiers, Buy-X-Get-Y, trade
// thresholds) is a later phase, every type still prices as a single flat Bundle Price for now.
const BUNDLE_TYPES = [
  {
    value: "ProductSystem",
    label: "Product System",
    icon: Blocks,
    blurb: "Complementary products sold as a kit",
  },
  {
    value: "ProjectStarterPack",
    label: "Project Starter Pack",
    icon: Package,
    blurb: "All materials for a defined project scope",
  },
  {
    value: "QuantityPallet",
    label: "Quantity / Pallet",
    icon: Boxes,
    blurb: "Bulk-quantity pricing",
  },
  {
    value: "TradeValue",
    label: "Trade Value",
    icon: Handshake,
    blurb: "Fixed-value bundle for B2B accounts",
  },
  {
    value: "CrossCategory",
    label: "Cross Category",
    icon: LayoutGrid,
    blurb: "Items spanning categories, one solution",
  },
  { value: "Promotional", label: "Promotional", icon: Tag, blurb: "Time-limited bundle offering" },
] as const;

const inputClass =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

type LineDraft = { productId: number | null; qty: string };

export function BundleFormDialog({
  open,
  onOpenChange,
  editingBundle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingBundle?: BundleDto | null;
}) {
  const { data: products } = useProducts(open);
  const createBundle = useCreateBundle();
  const updateBundle = useUpdateBundle();
  const isEditing = !!editingBundle;

  const { data: branches } = useBranches(open);
  const [type, setType] = useState<(typeof BUNDLE_TYPES)[number]["value"]>("ProductSystem");
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ productId: null, qty: "1" }]);
  const [saving, setSaving] = useState(false);
  // Phase 4 (BRD §5.7) Rules: scheduling, eligibility, discount stacking. Empty arrays mean "no
  // restriction" — matches the backend's own "[]" == everyone/every branch eligible convention.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eligibleCustomerTypes, setEligibleCustomerTypes] = useState<string[]>([]);
  const [eligibleBranchIds, setEligibleBranchIds] = useState<number[]>([]);
  const [stackableDiscount, setStackableDiscount] = useState(true);

  function reset() {
    setType("ProductSystem");
    setCode("");
    setNameEn("");
    setNameAr("");
    setBundlePrice("");
    setLines([{ productId: null, qty: "1" }]);
    setStartDate("");
    setEndDate("");
    setEligibleCustomerTypes([]);
    setEligibleBranchIds([]);
    setStackableDiscount(true);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  // Pre-fills every field from the bundle being edited — re-runs whenever a different row's "Edit"
  // is clicked while the dialog is already open, same pattern as CreatePricingRuleDialog.
  useEffect(() => {
    if (!open || !editingBundle) return;
    const b = editingBundle;
    setType(BUNDLE_TYPES.find((t) => t.value === b.type)?.value ?? "ProductSystem");
    setCode(b.code);
    setNameEn(b.nameEn);
    setNameAr(b.nameAr ?? "");
    setBundlePrice(String(b.bundlePrice));
    setLines(
      b.lines.length
        ? b.lines.map((l) => ({ productId: l.productId, qty: String(l.qty) }))
        : [{ productId: null, qty: "1" }],
    );
    setStartDate(b.startDate ? b.startDate.slice(0, 10) : "");
    setEndDate(b.endDate ? b.endDate.slice(0, 10) : "");
    setEligibleCustomerTypes(b.eligibleCustomerTypes ?? []);
    setEligibleBranchIds(b.eligibleBranchIds ?? []);
    setStackableDiscount(b.stackableDiscount ?? true);
  }, [open, editingBundle]);

  const productOptions = (products ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.sku} — ${p.nameEn}`,
  }));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const validLines = lines.filter((l) => l.productId !== null && Number(l.qty) > 0);
  const individualTotal = validLines.reduce(
    (s, l) => s + Number(l.qty) * (productById.get(l.productId!)?.sellingPrice ?? 0),
    0,
  );
  const price = Number(bundlePrice);
  const savings = price > 0 ? individualTotal - price : 0;

  const canSave = !saving && !!code.trim() && !!nameEn.trim() && price > 0 && validLines.length > 0;

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSave(publish: boolean) {
    const request = {
      code: code.trim(),
      nameEn: nameEn.trim(),
      nameAr: nameAr.trim() || null,
      bundlePrice: price,
      type,
      lines: validLines.map((l) => ({ productId: l.productId!, qty: Number(l.qty) })),
      startDate: startDate || null,
      endDate: endDate || null,
      eligibleCustomerTypes,
      eligibleBranchIds,
      stackableDiscount,
      publish,
    };

    setSaving(true);
    try {
      if (isEditing && editingBundle) {
        await updateBundle.mutateAsync({ id: editingBundle.id, request });
        toast.success("Bundle updated");
      } else {
        await createBundle.mutateAsync(request);
        toast.success(publish ? "Bundle submitted for approval" : "Bundle saved as Draft");
      }
      handleClose(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Could not ${isEditing ? "update" : "create"} the bundle — check the details and try again.`,
      );
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
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                Stock · Bundles
              </p>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-foreground">
                  {isEditing ? "Edit Bundle" : "Create Bundle"}
                </h2>
                {isEditing && editingBundle && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EFFECTIVE_STATUS_TONE[editingBundle.effectiveStatus] ?? "bg-black/5 text-muted-foreground"}`}
                  >
                    {editingBundle.effectiveStatus}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Package component SKUs into a sellable kit.
                {isEditing && editingBundle?.status === "Active" && (
                  <> Saving changes will re-open it for approval.</>
                )}
              </p>
            </div>
            <button
              onClick={() => handleClose(false)}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Bundle type — labels only for now; per-type pricing behavior is a later phase */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BUNDLE_TYPES.map((t) => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-brand bg-brand/5 ring-2 ring-brand/15"
                        : "border-black/10 bg-white hover:border-brand/30"
                    }`}
                  >
                    <div
                      className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-brand text-brand-foreground" : "bg-canvas text-muted-foreground"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{t.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {t.blurb}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Bundle code</label>
                <input
                  className={`${inputClass} font-mono`}
                  placeholder="BND-XXX-01"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Bundle price (<SARIcon />)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  placeholder="85.00"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Name (English)</label>
                <input
                  className={inputClass}
                  placeholder="Basement Waterproof Kit"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Name (Arabic)</label>
                <input
                  className={inputClass}
                  dir="rtl"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                />
              </div>
            </div>

            {/* Component line builder — real product search, replacing the old "SKU x Qty" tag field */}
            <div>
              <label className={labelClass}>Components</label>
              <div className="space-y-2 rounded-xl border border-black/5 bg-canvas/50 p-3">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <SearchableSelect
                      value={line.productId !== null ? String(line.productId) : ""}
                      onChange={(v) => updateLine(i, { productId: Number(v) })}
                      options={productOptions}
                      placeholder="Search SKU or product name…"
                      searchPlaceholder="Search products…"
                      className="flex-1"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="h-9 w-20 flex-none rounded-md border border-black/10 bg-white px-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                      value={line.qty}
                      onChange={(e) => updateLine(i, { qty: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="grid h-9 w-9 flex-none place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-destructive disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-brand hover:bg-brand/5"
                  onClick={() => setLines((prev) => [...prev, { productId: null, qty: "1" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Component
                </Button>
              </div>
            </div>

            {/* Phase 4 (BRD §5.7) Rules: scheduling, customer-group/branch eligibility, stacking. */}
            <div>
              <label className={labelClass}>Rules</label>
              <div className="space-y-4 rounded-xl border border-black/5 bg-canvas/50 p-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">
                      Start date (optional)
                    </label>
                    <input
                      type="date"
                      className={inputClass}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">
                      End date (optional)
                    </label>
                    <input
                      type="date"
                      className={inputClass}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] text-muted-foreground">
                    Eligible customer groups — none selected means everyone is eligible
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CUSTOMER_TYPES.map((t) => {
                      const active = eligibleCustomerTypes.includes(t.value);
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() =>
                            setEligibleCustomerTypes((prev) =>
                              active ? prev.filter((v) => v !== t.value) : [...prev, t.value],
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            active
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-black/10 bg-white text-muted-foreground hover:border-brand/30"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] text-muted-foreground">
                    Eligible branches — none selected means every branch is eligible
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(branches ?? []).map((b) => {
                      const active = eligibleBranchIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() =>
                            setEligibleBranchIds((prev) =>
                              active ? prev.filter((v) => v !== b.id) : [...prev, b.id],
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            active
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-black/10 bg-white text-muted-foreground hover:border-brand/30"
                          }`}
                        >
                          {b.nameEn}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-black/20"
                    checked={stackableDiscount}
                    onChange={(e) => setStackableDiscount(e.target.checked)}
                  />
                  Allow other discounts (coupon / manual / Trade Value) to stack on top of this
                  bundle
                </label>
              </div>
            </div>

            {/* Live preview — individual total vs bundle price, same savings math checkout applies */}
            {validLines.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3.5">
                <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                <p className="text-sm text-foreground/90">
                  Individual total:{" "}
                  <strong>
                    <CurrencyText value={formatSAR(individualTotal)} />
                  </strong>
                  {price > 0 && (
                    <>
                      {" "}
                      · Bundle price:{" "}
                      <strong>
                        <CurrencyText value={formatSAR(price)} />
                      </strong>
                      {savings > 0 ? (
                        <>
                          {" "}
                          · Customer saves{" "}
                          <strong className="text-success">
                            <CurrencyText value={formatSAR(savings)} />
                          </strong>
                        </>
                      ) : savings < 0 ? (
                        <>
                          {" "}
                          ·{" "}
                          <strong className="text-critical">
                            Bundle price is above the individual total
                          </strong>
                        </>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/5 bg-white px-6 py-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            {isEditing ? (
              <Button
                size="sm"
                onClick={() => handleSave(false)}
                disabled={!canSave}
                className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
              </Button>
            ) : (
              <>
                {/* Phase 4 (BRD §5.7): "Save: Draft or Publish" — Draft stays editable and invisible
                    to POS; Publish submits straight into the approval queue. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave(false)}
                  disabled={!canSave}
                  className="gap-1"
                >
                  {saving ? "Saving…" : "Save as Draft"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={!canSave}
                  className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Check className="h-4 w-4" /> {saving ? "Submitting…" : "Submit for Approval"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
