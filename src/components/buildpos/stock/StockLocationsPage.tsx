/**
 * §6 Stock Locations workspace. Lightweight by design — location hierarchy, allowed categories and
 * stock-eligibility flags only. No WMS routing/occupancy/put-away here (explicitly out of scope).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, Ban, CheckCircle2, Star } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/api/auth";
import { SEED_CATEGORIES } from "@/lib/buildpos/seed-products";
import {
  LOCATION_TYPES, locationPath, useLocationStore,
  type LocationDraft, type LocationType, type StockLocation,
} from "@/lib/stock/location-store";

const BRANCHES = ["Central", "Riyadh Main Branch", "Jeddah Branch", "Dammam Branch"];

function emptyDraft(): LocationDraft {
  return {
    code: "", name: "", type: "Branch Stockroom", branch: "Riyadh Main Branch", address: "",
    zone: "", aisle: "", rack: "", bin: "", floor: "Ground Floor", allowedCategories: [],
    sellable: true, quarantine: false, supplierReturnHold: false, active: true,
  };
}

export function StockLocationsPage() {
  const { user } = useAuth();
  const who = user?.name ?? "System";
  const { locations, create, update, setActive, setDefaultSellable } = useLocationStore();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All types");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockLocation | null>(null);
  const [draft, setDraft] = useState<LocationDraft>(emptyDraft());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => {
      if (typeFilter !== "All types" && l.type !== typeFilter) return false;
      if (!q) return true;
      return [l.id, l.code, l.name, l.branch, l.zone, l.aisle, l.rack, l.bin]
        .join(" ").toLowerCase().includes(q);
    });
  }, [locations, query, typeFilter]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }
  function openEdit(l: StockLocation) {
    setEditing(l);
    const { id: _id, defaultSellable: _d, ...rest } = l;
    setDraft(rest);
    setOpen(true);
  }
  function save() {
    if (editing) {
      update(editing.id, draft, who);
      toast.success(`${draft.code} updated`);
      setOpen(false);
      return;
    }
    const res = create(draft, who);
    if (!res.ok) {
      toast.error(res.error ?? "Location could not be saved.");
      return;
    }
    toast.success(`Stock location ${res.id} created`);
    setOpen(false);
  }

  const kpis = [
    { label: "Stock locations", value: locations.length, sub: "All types" },
    { label: "Active", value: locations.filter((l) => l.active).length, tone: "success" as const },
    { label: "Sellable", value: locations.filter((l) => l.sellable && l.active).length, sub: "POS deducts from these" },
    { label: "Restricted", value: locations.filter((l) => l.quarantine || l.supplierReturnHold).length, tone: "warning" as const, sub: "Quarantine / return hold" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        group="Products & Stock · Inventory & Stock"
        title="Stock Locations"
        desc="Location, zone, aisle, rack, bin and floor references for every stock balance. Quarantine and supplier-return-hold locations are excluded from sellable stock."
        primary="New location"
        onPrimary={openCreate}
      />
      <KpiGrid items={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, name, branch, zone, bin…"
          className="h-9 w-full max-w-xs"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All types">All types</SelectItem>
            {LOCATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/5 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Location ID", "Code", "Name", "Type", "Branch", "Zone · Aisle · Rack · Bin · Floor", "Stock eligibility", "Status", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t border-black/5 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{l.code}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-brand" />
                    {l.name}
                    {l.defaultSellable && <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-label="Default sellable location" />}
                  </div>
                  {l.allowedCategories.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{l.allowedCategories.join(", ")}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{l.type}</td>
                <td className="whitespace-nowrap px-3 py-2">{l.branch}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{locationPath(l)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {l.sellable && <Badge variant="secondary">Sellable</Badge>}
                    {l.quarantine && <Badge variant="outline">Quarantine</Badge>}
                    {l.supplierReturnHold && <Badge variant="outline">Return hold</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Badge variant={l.active ? "default" : "outline"}>{l.active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end">
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(l)}>Edit</Button>
                  {l.sellable && l.active && !l.defaultSellable && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => { setDefaultSellable(l.id, who); toast.success(`${l.code} is now the default sellable location`); }}>
                      Set default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => { setActive(l.id, !l.active, who); toast.success(`${l.code} ${l.active ? "deactivated" : "activated"}`); }}
                  >
                    {l.active ? <><Ban className="h-3.5 w-3.5" /> Deactivate</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Activate</>}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">No stock locations match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New stock location"}</DialogTitle>
            <DialogDescription>
              Location hierarchy and stock eligibility. Quarantine and supplier-return-hold stock stays out of available balances.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Location Code *">
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="RYD-YARD" disabled={!!editing} />
            </Field>
            <Field label="Location Name *">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Riyadh Outdoor Yard" />
            </Field>
            <Field label="Location Type">
              <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as LocationType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOCATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={draft.branch} onValueChange={(v) => setDraft({ ...draft, branch: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </Field>
            <Field label="Zone"><Input value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} /></Field>
            <Field label="Aisle"><Input value={draft.aisle} onChange={(e) => setDraft({ ...draft, aisle: e.target.value })} /></Field>
            <Field label="Rack"><Input value={draft.rack} onChange={(e) => setDraft({ ...draft, rack: e.target.value })} /></Field>
            <Field label="Bin"><Input value={draft.bin} onChange={(e) => setDraft({ ...draft, bin: e.target.value })} /></Field>
            <Field label="Floor reference"><Input value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} /></Field>
            <Field label="Allowed categories" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-black/5 p-2">
                {SEED_CATEGORIES.map((c) => {
                  const on = draft.allowedCategories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft({
                        ...draft,
                        allowedCategories: on
                          ? draft.allowedCategories.filter((x) => x !== c)
                          : [...draft.allowedCategories, c],
                      })}
                      className={`rounded-full px-2.5 py-1 text-xs transition ${on ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Leave empty to allow every category.</p>
            </Field>
            <Toggle label="Sellable stock allowed" checked={draft.sellable} onChange={(v) => setDraft({ ...draft, sellable: v })} />
            <Toggle label="Quarantine stock allowed" checked={draft.quarantine} onChange={(v) => setDraft({ ...draft, quarantine: v })} />
            <Toggle label="Supplier return hold allowed" checked={draft.supplierReturnHold} onChange={(v) => setDraft({ ...draft, supplierReturnHold: v })} />
            <Toggle label="Active" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-brand text-brand-foreground hover:bg-brand/90">
              {editing ? "Save changes" : "Create location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
