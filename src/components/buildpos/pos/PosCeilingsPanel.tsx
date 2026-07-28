import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POS_TIER_PRESETS, posTierFromCeilings, type PosCeilingsDto } from "@/lib/api/admin";

type BooleanField = Exclude<keyof PosCeilingsDto, "discountCeilingPercent" | "surplusReturnCeilingAmount">;

type ToggleDef = { field: BooleanField; label: string; hint: string };

// BRD §10.1's Cashier→Senior Cashier→Supervisor→Store Manager→System Admin authorization ladder —
// grouped so the two BRD §7 pricing ceilings (override / manage price lists) read as a distinct
// section rather than buried in a flat list of 11 checkboxes.
const GROUPS: { title: string; toggles: ToggleDef[] }[] = [
  {
    title: "Pricing",
    toggles: [
      { field: "canOverrideItemPrice", label: "Override item price at POS", hint: "Type an absolute price on a cart or quotation line, replacing the resolved list price (CR-039)." },
      { field: "canManagePriceListAndUsers", label: "Manage price lists & users", hint: "Edit Contractor/Wholesale/Project list prices on products and manage user accounts." },
    ],
  },
  {
    title: "Discounts & returns",
    toggles: [
      { field: "canAuthorizeStandardReturnWithoutReceipt", label: "Authorize returns without a receipt", hint: "Approve a standard return when the customer has no receipt on hand." },
      { field: "canAuthorizeDamagedReturns", label: "Authorize damaged-goods returns", hint: "Approve returns routed to the damaged/quarantine stock flow." },
      { field: "canConfigureReturnRulesAndFees", label: "Configure return rules & fees", hint: "Edit restocking-fee and return-window rules on the Returns settings page." },
    ],
  },
  {
    title: "Shift & transactions",
    toggles: [
      { field: "canVoidTransactions", label: "Void transactions solo", hint: "Void a sale without a second manager's PIN authorization." },
      { field: "canViewXReport", label: "View X report", hint: "Mid-shift cash/sales snapshot, doesn't close the shift." },
      { field: "canViewZReport", label: "View Z report", hint: "End-of-day close report — locks the shift's totals." },
    ],
  },
  {
    title: "System",
    toggles: [
      { field: "canManageSystemConfiguration", label: "Manage system configuration", hint: "Branches, terminals, devices, and global settings." },
    ],
  },
];

export function PosCeilingsPanel({
  values, onChange, disabled,
}: { values: PosCeilingsDto; onChange: (next: PosCeilingsDto) => void; disabled?: boolean }) {
  function setField<K extends keyof PosCeilingsDto>(field: K, value: PosCeilingsDto[K]) {
    onChange({ ...values, [field]: value });
  }

  const currentTier = posTierFromCeilings(values);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>Quick-apply a BRD §10.1 tier preset, then fine-tune individual ceilings below. Changes only save when you click Save Changes.</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Apply preset</Label>
          <Select
            value={currentTier}
            onValueChange={(tier) => onChange(POS_TIER_PRESETS[tier])}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(POS_TIER_PRESETS).map((tier) => <SelectItem key={tier} value={tier}>{tier}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumericCeiling
          label="Discount ceiling %"
          hint="Highest cart/line discount % this role can apply without supervisor approval. Leave uncapped for no limit."
          value={values.discountCeilingPercent}
          onChange={(v) => setField("discountCeilingPercent", v)}
          disabled={disabled}
          suffix="%"
        />
        <NumericCeiling
          label="Surplus return ceiling (SAR)"
          hint="Highest project-surplus return this role can authorize without escalation. Leave uncapped for no limit."
          value={values.surplusReturnCeilingAmount}
          onChange={(v) => setField("surplusReturnCeilingAmount", v)}
          disabled={disabled}
          suffix="ر.س"
        />
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
          <div className="divide-y divide-black/5 rounded-xl border border-black/10">
            {group.toggles.map((t) => (
              <div key={t.field} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                </div>
                <Switch
                  checked={Boolean(values[t.field])}
                  onCheckedChange={(checked) => setField(t.field, checked)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NumericCeiling({
  label, hint, value, onChange, disabled, suffix,
}: { label: string; hint: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; suffix: string }) {
  const uncapped = value === null;
  return (
    <div className="space-y-1.5 rounded-xl border border-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={uncapped}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? null : 0)}
            className="h-3.5 w-3.5 rounded border-black/20"
          />
          No cap
        </label>
      </div>
      <div className="relative">
        <Input
          type="number" min={0} step="0.5" className="h-9 pr-10"
          value={uncapped ? "" : value}
          placeholder={uncapped ? "Unlimited" : "0"}
          disabled={disabled || uncapped}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
