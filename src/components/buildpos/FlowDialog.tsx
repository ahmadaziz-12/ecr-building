import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Check, ChevronLeft, ChevronRight, ImageOff, Loader2, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Field, Flow, LineItemColumn } from "@/lib/buildpos/flows";
import { useCategories, useProducts, useVariantGroups } from "@/lib/api/catalog";
import { useBranches, useTerminals, useUsers, useRoles } from "@/lib/api/admin";
import { useAuth } from "@/lib/api/auth";
import { useStockLevels, useBranchStockLevels } from "@/lib/api/inventory";
import { sellableUoms, unitPriceFor, factorToStock } from "@/lib/buildpos/uom";
import { fileToCompressedDataUrl } from "@/lib/buildpos/image";
import { SearchableSelect } from "@/components/buildpos/SearchableSelect";
import { CurrencyText } from "@/lib/buildpos/currency";
import { cols } from "@/lib/buildpos/grid";

type LineItemRow = Record<string, string>;

function parseRows(value: string): LineItemRow[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Toggle-pill multi-select — branches selected on one row all get the same qty/cost/batch, so a
// single row can target several branches at once instead of needing one row per branch. Renders
// inline (no floating popover) so it can never get clipped or overlap the dialog's scroll area.
function BranchMultiSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: branches } = useBranches();
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name).join(", ") : [...selected, name].join(", "));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {branches?.map((b) => {
        const on = selected.includes(b.nameEn);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => toggle(b.nameEn)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              on ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white text-muted-foreground hover:border-brand/40"
            }`}
          >
            {b.nameEn}
          </button>
        );
      })}
      {!branches?.length && <p className="text-xs text-muted-foreground">No branches available.</p>}
    </div>
  );
}

// Resolves a "Warehouse: <name>" / "Branch: <name>" location value (see Stock Transfer's location
// picker) into a sku -> available-quantity map, so a lineItems field can show and validate against
// real stock. Returns null when there's nothing to resolve — callers gate rendering on that.
function useLocationAvailability(locationValue: string | undefined): Map<string, number> | null {
  const isWarehouse = !!locationValue?.toLowerCase().startsWith("warehouse:");
  const isBranch = !!locationValue?.toLowerCase().startsWith("branch:");
  const { data: stockLevels } = useStockLevels(isWarehouse);
  const { data: branchStockLevels } = useBranchStockLevels(isBranch);

  return useMemo(() => {
    if (!locationValue) return null;
    if (isWarehouse) {
      const name = locationValue.slice("warehouse:".length).trim().toLowerCase();
      const map = new Map<string, number>();
      stockLevels?.filter((s) => s.warehouseName.toLowerCase() === name).forEach((s) => map.set(s.sku, s.available));
      return map;
    }
    if (isBranch) {
      const name = locationValue.slice("branch:".length).trim().toLowerCase();
      const map = new Map<string, number>();
      branchStockLevels?.filter((s) => s.branchName.toLowerCase() === name).forEach((s) => map.set(s.sku, s.available));
      return map;
    }
    return null;
  }, [locationValue, isWarehouse, isBranch, stockLevels, branchStockLevels]);
}

// Renders a lineItems field as a stack of removable row-cards (not a table — a table's fixed
// columns can't fit 5-6 labeled inputs without truncating text or clipping the branch
// multi-select). Each row is its own labeled mini-form so every control gets full width.
// "product"/"branch" columns pull live options here (products/branches are cheap, already-cached
// queries elsewhere in the app); "select" columns use whatever options the field carries (see
// Field.lineItemColumns — e.g. Receive PO injects that PO's own outstanding lines there).
function LineItemsField({
  columns, value, onChange, availabilityMap,
}: {
  columns: LineItemColumn[]; value: string; onChange: (v: string) => void;
  /** sku -> available qty at the location picked in another field — see LineItemColumn.availabilityField. */
  availabilityMap?: Map<string, number> | null;
}) {
  const { data: products } = useProducts();
  const rows = parseRows(value).length ? parseRows(value) : [{}];
  const availabilityColumn = columns.find((c) => c.availabilityField);
  // Cross-reference for a "uom" column: which OTHER column on the same row holds the chosen SKU —
  // same pattern as availabilityColumn, generalized so this isn't hardcoded to Create PO's field names.
  const productColumn = columns.find((c) => c.type === "product");
  const uomColumn = columns.find((c) => c.type === "uom");

  function setRows(next: LineItemRow[]) {
    onChange(JSON.stringify(next));
  }
  function updateCell(rowIdx: number, key: string, cellValue: string) {
    let row = { ...rows[rowIdx], [key]: cellValue };
    // Auto-fill unit cost from the picked product the first time a row's item is set.
    if (key === "sku" && !row.unitCost) {
      const product = products?.find((p) => p.sku === cellValue);
      if (product && columns.some((c) => c.key === "unitCost")) {
        row = { ...row, unitCost: String(product.costPrice) };
      }
    }
    // Switching product invalidates any previously chosen purchasing UOM — reset to "" (the new
    // product's own stock UOM), the only value guaranteed valid for every product.
    if (key === "sku" && uomColumn) {
      row = { ...row, [uomColumn.key]: "" };
    }
    // A UOM switch always re-suggests the unit cost from the product's stock-UOM cost × the new
    // factor (1 Pallet = 50 Bag → 50× the per-bag cost) — same behavior as the POS cart's own UOM
    // switch (PosCheckout.changeUom). It's a suggestion, not a lock: the buyer can still overtype it
    // with the supplier's actual invoiced price afterward.
    if (uomColumn && key === uomColumn.key && productColumn) {
      const product = products?.find((p) => p.sku === row[productColumn.key]);
      if (product && columns.some((c) => c.key === "unitCost")) {
        const factor = factorToStock(cellValue || product.stockUom, product.stockUom, product.uomConversions) ?? 1;
        row = { ...row, unitCost: String(unitPriceFor(product.costPrice, factor)) };
      }
    }
    setRows(rows.map((r, i) => (i === rowIdx ? row : r)));
  }
  function addRow() {
    setRows([...rows, {}]);
  }
  function removeRow(rowIdx: number) {
    setRows(rows.length > 1 ? rows.filter((_, i) => i !== rowIdx) : [{}]);
  }

  const inputClass =
    "h-9 w-full rounded-md border border-black/10 bg-white px-2.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

  return (
    <div className="space-y-2.5">
      {rows.map((row, rowIdx) => {
        const showsAvailability = !!availabilityColumn && !!availabilityMap;
        const rowSku = availabilityColumn ? row[availabilityColumn.key] : undefined;
        const rowAvailable = showsAvailability && rowSku ? availabilityMap!.get(rowSku) : undefined;
        const rowQty = availabilityColumn?.availabilityQtyKey ? Number(row[availabilityColumn.availabilityQtyKey] || 0) : undefined;
        const rowOverAvailable = rowAvailable !== undefined && rowQty !== undefined && rowQty > rowAvailable;
        return (
        <div key={rowIdx} className="relative rounded-lg border border-black/10 bg-canvas/40 p-3 pr-10">
          <button
            type="button"
            onClick={() => removeRow(rowIdx)}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
            aria-label="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className={`ui-tile-grid ${cols(columns.length)}`}>
            {columns.map((c) => (
              <div key={c.key} className={c.type === "branch" ? "col-span-2 sm:col-span-3" : ""}>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><CurrencyText value={c.label} /></label>
                {c.type === "product" ? (
                  <>
                    <SearchableSelect
                      value={row[c.key] ?? ""}
                      onChange={(v) => updateCell(rowIdx, c.key, v)}
                      placeholder="Select item…"
                      searchPlaceholder="Search SKU or name…"
                      options={(products ?? []).map((p) => {
                        const avail = showsAvailability ? availabilityMap!.get(p.sku) : undefined;
                        return {
                          value: p.sku,
                          label: `${p.sku} — ${p.nameEn}${avail !== undefined ? ` (Avail: ${avail})` : ""}`,
                        };
                      })}
                    />
                    {showsAvailability && rowSku && (
                      <p className={`mt-1 text-[11px] ${rowAvailable !== undefined && rowAvailable <= 0 ? "text-critical" : "text-muted-foreground"}`}>
                        {rowAvailable !== undefined ? `Available: ${rowAvailable}` : "No stock record at this location."}
                      </p>
                    )}
                  </>
                ) : c.type === "branch" ? (
                  <BranchMultiSelect value={row[c.key] ?? ""} onChange={(v) => updateCell(rowIdx, c.key, v)} />
                ) : c.type === "uom" ? (
                  (() => {
                    const rowProduct = productColumn ? products?.find((p) => p.sku === row[productColumn.key]) : undefined;
                    return (
                      <select
                        className={inputClass}
                        value={row[c.key] ?? ""}
                        disabled={!rowProduct}
                        onChange={(e) => updateCell(rowIdx, c.key, e.target.value)}
                      >
                        {!rowProduct && <option value="">Pick an item first…</option>}
                        {rowProduct &&
                          sellableUoms(rowProduct.stockUom, rowProduct.uomConversions).map((u) => (
                            <option key={u.uom} value={u.factorToStock === 1 ? "" : u.uom}>
                              {u.uom}
                              {u.factorToStock !== 1 ? ` (= ${u.factorToStock} ${rowProduct.stockUom})` : " (stock unit)"}
                            </option>
                          ))}
                      </select>
                    );
                  })()
                ) : c.type === "select" ? (
                  <select className={inputClass} value={row[c.key] ?? ""} onChange={(e) => updateCell(rowIdx, c.key, e.target.value)}>
                    <option value="">Select…</option>
                    {c.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                      className={inputClass}
                      placeholder={c.placeholder}
                      value={row[c.key] ?? ""}
                      onChange={(e) => updateCell(rowIdx, c.key, e.target.value)}
                    />
                    {c.key === availabilityColumn?.availabilityQtyKey && rowOverAvailable && (
                      <p className="mt-1 text-[11px] text-critical">Exceeds available ({rowAvailable}).</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 py-2 text-xs font-medium text-brand hover:border-brand/40 hover:bg-brand/5"
      >
        <Plus className="h-3.5 w-3.5" /> Add Row
      </button>
    </div>
  );
}

// Product photo picker: compresses the chosen file client-side into a base64 JPEG data URL (see
// lib/buildpos/image.ts — there's no file-upload/blob-storage backend, Product.ImageUrl stores the
// data URL directly) and previews it as a thumbnail. "Remove" clears the field back to no photo.
function ImagePickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    try {
      onChange(await fileToCompressedDataUrl(file));
    } catch {
      toast.error("Could not read that image — try a different file.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-canvas">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => inputRef.current?.click()}>
          {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {value ? "Change photo" : "Upload photo"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" className="text-critical hover:text-critical" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
    </div>
  );
}

function FieldControl({
  field, value, onChange, disabled,
}: { field: Field; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const base =
    "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-muted-foreground";

  if (field.scannable) {
    return (
      <div className="relative">
        <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
        <input
          type="text"
          className={`${base} pl-9`}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus
        />
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        className={`${base} min-h-[84px] py-2`}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{field.placeholder ?? "Select…"}</option>
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
        onClick={() => !disabled && onChange(on ? "" : "on")}
        disabled={disabled}
        className={`inline-flex h-8 w-14 items-center rounded-full border transition ${
          on ? "border-brand/40 bg-brand" : "border-black/10 bg-canvas"
        } disabled:cursor-not-allowed disabled:opacity-50`}
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
        disabled={disabled}
      />
    );
  }
  if (field.type === "image") {
    return <ImagePickerField value={value} onChange={onChange} />;
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      className={base}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

export function FlowDialog({
  flow,
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  fieldOverrides,
}: {
  flow: Flow | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Persist to the real backend. Throw to keep the dialog open and show an error toast. */
  onSubmit?: (values: Record<string, string>) => Promise<void>;
  /** Prefill fields (row-action Edit/Adjust/Transfer flows opened from an existing record). */
  initialValues?: Record<string, string>;
  /** Per-open field overrides — e.g. Receive PO injects that PO's own outstanding lines into the
   *  "lines" lineItems field's "line" column options, since those choices aren't static. */
  fieldOverrides?: Record<string, Partial<Field>>;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Seed every field's `default` (across all steps) under the incoming prefill, so an untouched
    // field submits exactly what the form displays instead of undefined (prefill still wins, even
    // with an intentionally-empty value, e.g. a toggle prefilled off).
    const seeded: Record<string, string> = {};
    for (const s of flow?.steps ?? []) {
      for (const f of s.fields) {
        if (f.default !== undefined) seeded[f.name] = f.default;
      }
    }
    setValues({ ...seeded, ...initialValues });
    // Only re-seed when the dialog opens (or shows a different flow) — otherwise a stale
    // initialValues reference on every render would keep resetting the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flow]);

  const steps = flow?.steps ?? [];
  const isReview = step === steps.length;
  const total = steps.length + 1; // + review
  const hasLineItems = steps.some((s) => s.fields.some((f) => f.type === "lineItems"));

  // At most one lineItems field per flow needs live availability today (Stock Transfer's items
  // step, checked against whichever location the "from" field holds) — find it once, generically,
  // rather than hardcoding the flow.
  const availabilityRef = useMemo(() => {
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.type !== "lineItems") continue;
        const col = f.lineItemColumns?.find((c) => c.availabilityField);
        if (col) return { fieldName: f.name, locationField: col.availabilityField! };
      }
    }
    return null;
  }, [steps]);
  const availabilityMap = useLocationAvailability(availabilityRef ? values[availabilityRef.locationField] : undefined);

  // Live options for selects with Field.optionsSource — the hooks run unconditionally (React
  // requires it) but only actually fetch the lists this flow's fields reference.
  const optionsSources = useMemo(() => {
    const set = new Set<string>();
    for (const s of steps) for (const f of s.fields) if (f.optionsSource) set.add(f.optionsSource);
    return set;
  }, [steps]);
  const { data: liveBranches } = useBranches(open && optionsSources.has("branches"));
  const { data: liveTerminals } = useTerminals(open && optionsSources.has("terminals"));
  const { data: liveCategories } = useCategories(
    open && (optionsSources.has("topCategories") || optionsSources.has("subcategories")),
  );
  const { data: liveUsers } = useUsers(open && optionsSources.has("users"));
  const { data: liveRoles } = useRoles(open && optionsSources.has("roles"));
  const { data: liveVariantGroups } = useVariantGroups(open && optionsSources.has("variantGroups"));
  const liveOptions: Record<Exclude<NonNullable<Field["optionsSource"]>, "subcategories">, string[] | undefined> = {
    branches: liveBranches?.map((b) => b.nameEn),
    terminals: liveTerminals?.map((t) => t.code),
    topCategories: liveCategories?.filter((c) => c.parentId == null).map((c) => c.nameEn),
    users: liveUsers?.map((u) => u.name),
    roles: liveRoles?.map((r) => r.name),
    variantGroups: liveVariantGroups?.map((g) => g.nameEn),
  };

  function resolveField(f: Field): Field {
    const override = fieldOverrides?.[f.name];
    let merged = override ? { ...f, ...override } : f;
    if (merged.optionsSource === "subcategories") {
      // Narrowed live by whichever top-level category is currently picked in the sibling
      // `dependsOn` field — e.g. picking "Electric" lists only Electric's own subcategories.
      const parentName = merged.dependsOn ? values[merged.dependsOn] : undefined;
      const parent = parentName
        ? liveCategories?.find((c) => c.parentId == null && c.nameEn.toLowerCase() === parentName.toLowerCase())
        : undefined;
      const children = parent ? (liveCategories?.filter((c) => c.parentId === parent.id).map((c) => c.nameEn) ?? []) : [];
      const placeholder = !parentName
        ? "Pick a category first"
        : children.length === 0
          ? `No subcategories for "${parentName}" — leave blank`
          : merged.placeholder;
      merged = { ...merged, options: [...(merged.options ?? []), ...children], placeholder };
    } else if (merged.optionsSource) {
      // Static options on an optionsSource field are special leading entries ("Unassigned",
      // "— This is a Main Category —"); the real choices come from the live list.
      merged = { ...merged, options: [...(merged.options ?? []), ...(liveOptions[merged.optionsSource] ?? [])] };
    }
    // Applies to every source (static, live, or subcategory-narrowed): a field that must not
    // offer whatever a sibling already holds — e.g. Stock Transfer's "to" can't be the "from".
    if (merged.excludeValueOf && merged.options) {
      const excluded = values[merged.excludeValueOf];
      if (excluded) merged = { ...merged, options: merged.options.filter((o) => o !== excluded) };
    }
    return merged;
  }

  // A hideUnless field (e.g. Minimum Cut Charge) is only relevant once its controlling sibling
  // (Cut-to-size mode) actually differs from the "off" value — otherwise it's confusing clutter on
  // a product that isn't cut-to-size at all.
  function isFieldVisible(f: Field): boolean {
    if (!f.hideUnless) return true;
    return (values[f.hideUnless.field] ?? "") !== f.hideUnless.notEquals;
  }

  function summarizeLineItems(field: Field, raw: string): string {
    const rows = parseRows(raw);
    if (!rows.length) return "";
    const cols = field.lineItemColumns ?? [];
    const line = (row: LineItemRow) =>
      cols
        .map((c) => {
          const v = row[c.key];
          if (!v) return null;
          return c.type === "select" ? (c.options?.find((o) => o.value === v)?.label ?? v) : v;
        })
        .filter(Boolean)
        .join(" · ");
    return `${rows.length} row${rows.length === 1 ? "" : "s"}: ${rows.map(line).filter(Boolean).join(", ")}`;
  }

  const summary = useMemo(() => {
    return steps.flatMap((s) =>
      s.fields
        .map((rawF) => {
          const f = resolveField(rawF);
          const raw = values[f.name];
          // An image field's value is a giant base64 data URL — never worth dumping into the
          // review step as text.
          const val = f.type === "lineItems" ? summarizeLineItems(f, raw ?? "") : f.type === "image" ? (raw ? "Photo attached" : "") : raw;
          return { label: f.label, val };
        })
        .filter((x) => x.val && x.val.trim().length > 0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, values, fieldOverrides]);

  // Setting a field's value cascades to the three kinds of field that depend on it, because all
  // three can be left holding a value that no longer makes sense:
  //  • excludeValueOf — e.g. changing Stock Transfer's "from" to whatever "to" already held would
  //    leave "to" showing a value it now excludes.
  //  • dependsOn — e.g. Subcategory is narrowed by Category, so changing Category strands a
  //    subcategory that doesn't belong under the new parent.
  //  • hideUnless — e.g. switching Cut-to-size back to "Not cut-to-size" should drop whatever
  //    Minimum Cut Charge was typed, or it'd silently resubmit on a product it no longer applies to.
  // All three sweep every step, not just the current one, since a dependent field can live further on.
  function handleFieldChange(fieldName: string, v: string) {
    setValues((s) => {
      const next = { ...s, [fieldName]: v };
      for (const step of steps) {
        for (const field of step.fields) {
          if (field.excludeValueOf === fieldName && next[field.name] === v) next[field.name] = "";
          if (field.dependsOn === fieldName) next[field.name] = "";
          if (field.hideUnless?.field === fieldName && v === field.hideUnless.notEquals) next[field.name] = "";
        }
      }
      return next;
    });
  }

  function reset() {
    setStep(0);
    setValues({});
    setDone(false);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  // A field's `required` flag (flows.ts) was previously cosmetic — it drew a red asterisk but
  // never actually blocked Continue/Save, so a flow could be submitted with blank required
  // fields or a lineItems field carrying zero rows. This makes it real: a lineItems field counts
  // as satisfied only once at least one row has some cell filled in.
  function isFieldSatisfied(f: Field): boolean {
    if (!f.required || !isFieldVisible(f)) return true;
    const val = values[f.name] ?? f.default;
    if (f.type === "lineItems") {
      return parseRows(val ?? "").some((row) => Object.values(row).some((v) => v != null && String(v).trim() !== ""));
    }
    return !!val && val.trim().length > 0;
  }

  function firstMissingField(stepIdx: number): Field | undefined {
    return steps[stepIdx]?.fields.map(resolveField).find((f) => !isFieldSatisfied(f));
  }

  function firstMissingFieldOverall(): Field | undefined {
    for (let i = 0; i < steps.length; i++) {
      const missing = firstMissingField(i);
      if (missing) return missing;
    }
    return undefined;
  }

  async function save() {
    const missing = firstMissingFieldOverall();
    if (missing) {
      toast.error(`${missing.label} is required.`, {
        description: missing.type === "lineItems" ? "Add at least one line item." : undefined,
      });
      return;
    }
    if (!onSubmit) {
      setDone(true);
      toast.success(flow?.successTitle ?? `${flow?.title} saved`, {
        description: flow?.successMsg ?? "Mock data recorded — not connected to a live backend yet.",
      });
      setTimeout(() => handleClose(false), 900);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(values);
      setDone(true);
      toast.success(flow?.successTitle ?? `${flow?.title} saved`, { description: flow?.successMsg });
      setTimeout(() => handleClose(false), 900);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!flow) return null;
  const Icon = flow.icon;
  const current = steps[step];
  const stepMissing = isReview ? undefined : firstMissingField(step);
  const overallMissing = isReview ? firstMissingFieldOverall() : undefined;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={`${hasLineItems ? "max-w-4xl" : "max-w-3xl"} overflow-hidden p-0 sm:rounded-2xl`}
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
            {/* No close button here — DialogContent renders one at top-right for every dialog, so a
                second one beside the heading showed as two crosses. Both went through
                onOpenChange={handleClose}, so removing this one changes nothing but the duplicate.
                pe-12 keeps the heading clear of the built-in button. */}
            <div className="flex items-start justify-between gap-3 border-b border-black/5 py-4 ps-6 pe-12">
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
                          {s.val === "on" ? "Enabled" : <CurrencyText value={s.val} />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {current?.fields.map((rawF) => {
                    const f = resolveField(rawF);
                    if (!isFieldVisible(f)) return null;
                    const locked = f.requiresCeiling ? !(user?.posCeilings[f.requiresCeiling] ?? false) : false;
                    return (
                      <div key={f.name} className={f.full ? "md:col-span-2" : ""}>
                        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {f.label}
                          {f.required && <span className="text-critical">*</span>}
                          {locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Locked by permission" />}
                        </label>
                        {f.type === "lineItems" ? (
                          <LineItemsField
                            columns={f.lineItemColumns ?? []}
                            value={values[f.name] ?? ""}
                            onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
                            availabilityMap={availabilityRef?.fieldName === f.name ? availabilityMap : null}
                          />
                        ) : (
                          <FieldControl
                            field={f}
                            value={values[f.name] ?? f.default ?? ""}
                            onChange={(v) => handleFieldChange(f.name, v)}
                            disabled={locked}
                          />
                        )}
                        {f.hint && <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>}
                      </div>
                    );
                  })}
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
                    disabled={done || saving || !!overallMissing}
                    className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    <Check className="h-4 w-4" /> {saving ? "Saving…" : `Save ${flow.title}`}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!!stepMissing}
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