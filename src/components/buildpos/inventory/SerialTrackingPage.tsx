import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, exportToCsv, type FilterFieldDef, type FilterDraftValue } from "@/components/buildpos/pos/shared";
import { useSerializedUnits, useRegisterSerials, useUpdateSerialStatus, useSerialLookup, type SerializedUnitDto } from "@/lib/api/serials";
import { useProducts } from "@/lib/api/catalog";
import { useBranches } from "@/lib/api/admin";
import { useAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const STATUSES = ["InStock", "Sold", "Returned", "UnderWarranty", "Scrapped"];
const STATUS_LABELS: Record<string, string> = {
  InStock: "In Stock", Sold: "Sold", Returned: "Returned", UnderWarranty: "Under Warranty", Scrapped: "Scrapped",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }) : "—";
}

function RegisterSerialsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { data: products } = useProducts(open);
  const { data: branches } = useBranches(open && user?.branchId == null);
  const trackedProducts = (products ?? []).filter((p) => p.requiresSerialTracking);

  const [productId, setProductId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(user?.branchId ?? null);
  const [serialsText, setSerialsText] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const register = useRegisterSerials();

  const serialNumbers = serialsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const effectiveBranchId = user?.branchId ?? branchId;
  const canSubmit = productId != null && effectiveBranchId != null && serialNumbers.length > 0;

  function reset() {
    setProductId(null);
    setBranchId(user?.branchId ?? null);
    setSerialsText("");
    setWarrantyExpiresAt("");
    setNotes("");
  }

  async function submit() {
    if (!canSubmit || productId == null || effectiveBranchId == null) return;
    try {
      const created = await register.mutateAsync({
        productId, branchId: effectiveBranchId, serialNumbers,
        warrantyExpiresAt: warrantyExpiresAt || null, notes: notes.trim() || null,
      });
      toast.success(`${created.length} serial number(s) registered`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not register these serial numbers.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Register Serial Numbers</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Product <span className="text-critical">*</span></label>
            <Select value={productId ? String(productId) : ""} onValueChange={(v) => setProductId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Select a serial-tracked product…" /></SelectTrigger>
              <SelectContent>
                {trackedProducts.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nameEn} ({p.sku})</SelectItem>)}
              </SelectContent>
            </Select>
            {trackedProducts.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                No products are marked "Requires Serial Tracking" yet — enable it on a product in Product Catalog first.
              </p>
            )}
          </div>
          {user?.branchId == null && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Branch <span className="text-critical">*</span></label>
              <Select value={branchId ? String(branchId) : ""} onValueChange={(v) => setBranchId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select a branch…" /></SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nameEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Serial Numbers <span className="text-critical">*</span>
            </label>
            <Textarea rows={4} value={serialsText} onChange={(e) => setSerialsText(e.target.value)} placeholder={"One per line, e.g.\nSN-2026-00123\nSN-2026-00124"} />
            {serialNumbers.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{serialNumbers.length} serial(s) will be registered.</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Warranty Expires (optional)</label>
            <Input type="date" value={warrantyExpiresAt} onChange={(e) => setWarrantyExpiresAt(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Received from Supplier PO #1042" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit || register.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WarrantyLookupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [serialNo, setSerialNo] = useState("");
  const [searched, setSearched] = useState("");
  const { data, isFetching, isError } = useSerialLookup(searched, searched.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSerialNo(""); setSearched(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Warranty Lookup</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={serialNo} onChange={(e) => setSerialNo(e.target.value)} placeholder="Enter serial number…"
            onKeyDown={(e) => { if (e.key === "Enter") setSearched(serialNo.trim()); }}
          />
          <Button size="sm" onClick={() => setSearched(serialNo.trim())} disabled={!serialNo.trim()}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {isFetching && <p className="text-sm text-muted-foreground">Looking up…</p>}
        {isError && searched && <p className="text-sm text-critical">No unit found for serial "{searched}".</p>}
        {data && (
          <div className="space-y-2 rounded-lg border border-black/10 bg-canvas p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{data.productName}</p>
              <Pill tone={statusTone(data.status)}>{STATUS_LABELS[data.status] ?? data.status}</Pill>
            </div>
            <p className="text-muted-foreground">SKU: {data.sku}</p>
            <p className="text-muted-foreground">Serial: <span className="font-mono">{data.serialNo}</span></p>
            <p className="text-muted-foreground">Branch: {data.branchName}</p>
            <p className="text-muted-foreground">Received: {fmtDate(data.receivedDate)}</p>
            {data.soldOrderNo && <p className="text-muted-foreground">Sold on: {data.soldOrderNo}</p>}
            {data.warrantyExpiresAt && (
              <p className={new Date(data.warrantyExpiresAt) < new Date() ? "font-medium text-critical" : "text-muted-foreground"}>
                Warranty {new Date(data.warrantyExpiresAt) < new Date() ? "expired" : "expires"}: {fmtDate(data.warrantyExpiresAt)}
              </p>
            )}
            {data.notes && <p className="text-muted-foreground">Notes: {data.notes}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const FIELDS: FilterFieldDef[] = [
  { kind: "select", key: "status", placeholder: "Status", options: STATUSES, labels: STATUS_LABELS },
  { kind: "search", key: "search", placeholder: "Search serial, SKU, product…" },
];

export function SerialTrackingPage() {
  const { data: units, refetch } = useSerializedUnits();
  const updateStatus = useUpdateSerialStatus();
  const [registering, setRegistering] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [draft, setDraft] = useState<Record<string, FilterDraftValue>>(() => emptyFilterDraft(FIELDS));
  const [applied, setApplied] = useState<Record<string, FilterDraftValue>>(draft);

  const filtered = useMemo(() => {
    const status = (applied.status as string[]) ?? [];
    const search = ((applied.search as string) ?? "").trim().toLowerCase();
    return (units ?? []).filter((u) => {
      if (status.length && !status.includes(u.status)) return false;
      if (search && !u.serialNo.toLowerCase().includes(search) && !u.sku.toLowerCase().includes(search) && !u.productName.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [units, applied]);

  const kpis = [
    { label: "In Stock", value: (units ?? []).filter((u) => u.status === "InStock").length, sub: "Available to sell", tone: "success" as const },
    { label: "Sold", value: (units ?? []).filter((u) => u.status === "Sold").length, sub: "Linked to a sale", tone: "info" as const },
    { label: "Under Warranty", value: (units ?? []).filter((u) => u.status === "UnderWarranty").length, sub: "Active claims", tone: "warning" as const },
    { label: "Returned / Scrapped", value: (units ?? []).filter((u) => u.status === "Returned" || u.status === "Scrapped").length, sub: "Out of circulation", tone: "critical" as const },
  ];

  async function setStatus(unit: SerializedUnitDto, status: string) {
    try {
      await updateStatus.mutateAsync({ id: unit.id, status });
      toast.success(`${unit.serialNo} marked ${STATUS_LABELS[status] ?? status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this unit.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Stock"
        title="Serial Number Tracking"
        desc="Track individually-warrantied units — power tools, generators, appliances — by serial number from receiving through sale to warranty claim."
        onRefresh={() => refetch()}
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setLookingUp(true)}>
              <Search className="h-3.5 w-3.5" /> Warranty Lookup
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setRegistering(true)}>
              Register Serial(s)
            </Button>
          </>
        }
      />

      <FilterBar
        fields={FIELDS}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(FIELDS); setDraft(empty); setApplied(empty); }}
        resultLabel={`${filtered.length} units`}
      />

      <KpiGrid items={kpis} scope="serial-tracking" />

      <SectionCard
        title="Serialized Units"
        desc={`${filtered.length} records`}
        action={
          <Button
            variant="ghost" size="sm" className="h-8 gap-1.5"
            onClick={() => {
              exportToCsv(
                "serialized-units.csv",
                ["Serial No", "SKU", "Product", "Branch", "Status", "Received", "Sold Order", "Warranty Expires", "Notes"],
                filtered.map((u) => [u.serialNo, u.sku, u.productName, u.branchName, u.status, u.receivedDate, u.soldOrderNo ?? "", u.warrantyExpiresAt ?? "", u.notes ?? ""]),
              );
              toast.success("Exported CSV");
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial No</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Sold Order</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.serialNo}</TableCell>
                  <TableCell>{u.productName} <span className="text-muted-foreground">({u.sku})</span></TableCell>
                  <TableCell className="text-muted-foreground">{u.branchName}</TableCell>
                  <TableCell><Pill tone={statusTone(u.status)}>{STATUS_LABELS[u.status] ?? u.status}</Pill></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(u.receivedDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{u.soldOrderNo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(u.warrantyExpiresAt)}</TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        { label: "Mark Under Warranty", onClick: () => setStatus(u, "UnderWarranty"), disabled: u.status !== "Sold" },
                        { label: "Mark Returned", onClick: () => setStatus(u, "Returned"), disabled: u.status === "Returned" || u.status === "Scrapped" },
                        { label: "Back In Stock", onClick: () => setStatus(u, "InStock"), disabled: u.status !== "Returned" },
                        { label: "Scrap", onClick: () => setStatus(u, "Scrapped"), destructive: true, disabled: u.status === "Scrapped" || u.status === "Sold" },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No serialized units match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <RegisterSerialsDialog open={registering} onOpenChange={setRegistering} />
      <WarrantyLookupDialog open={lookingUp} onOpenChange={setLookingUp} />
    </div>
  );
}
