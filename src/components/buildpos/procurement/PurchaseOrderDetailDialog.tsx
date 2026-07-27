import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/buildpos/sections";
import { statusTone } from "@/components/buildpos/pos/shared";
import { usePurchaseOrderHistory, type PurchaseOrderDto } from "@/lib/api/procurement";

const STATUS_LABELS: Record<string, string> = {
  PendingApproval: "Pending Approval",
  InTransit: "In Transit",
  PartialReceive: "Partial Receive",
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

// Audit events written by PurchaseOrdersController — anything unmapped renders raw.
const EVENT_LABELS: Record<string, string> = {
  PO_CREATED: "Created",
  PO_SUBMITTED: "Submitted for Approval",
  PO_APPROVED: "Approved",
  PO_DISPATCHED: "Dispatched",
  PO_RECEIVED: "Goods Received",
  PO_CANCELLED: "Cancelled",
};

const RECEIVABLE = new Set(["Sent", "InTransit", "PartialReceive", "Delayed"]);

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export function PurchaseOrderDetailDialog({
  po, onClose, onReceive,
}: {
  po: PurchaseOrderDto | null;
  onClose: () => void;
  onReceive: (po: PurchaseOrderDto) => void;
}) {
  const { data: history, isLoading: historyLoading } = usePurchaseOrderHistory(po?.id);
  const receivable = po !== null && RECEIVABLE.has(po.status) && po.lines.some((l) => l.receivedQty < l.qty);
  const linesValue = po?.lines.reduce((s, l) => s + l.qty * l.unitCost, 0) ?? 0;

  return (
    <Dialog open={po !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {po && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-base">
                {po.poNo}
                <Pill tone={statusTone(statusLabel(po.status))}>{statusLabel(po.status)}</Pill>
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <InfoField label="Supplier" value={po.supplierName} />
              <InfoField label="Expected Date" value={fmtDate(po.expectedDate)} />
              <InfoField label="Currency" value={po.currency} />
              <InfoField label="Incoterm" value={po.incoterm ?? "—"} />
              <InfoField label="Carrier" value={po.carrier ?? "—"} />
              <InfoField label="Tracking Ref" value={po.trackingRef ?? "—"} />
              <InfoField label="Received" value={`${po.receivedPct}%`} />
              <InfoField label="Total Value" value={fmtSar(po.totalValue)} />
            </div>

            <Tabs defaultValue="lines">
              <TabsList>
                <TabsTrigger value="lines">Lines ({po.lines.length})</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="lines" className="space-y-3">
                <div className="overflow-x-auto rounded-lg border border-black/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">Branch</th>
                        <th className="px-3 py-2 text-left">Warehouse</th>
                        <th className="px-3 py-2 text-right">Ordered</th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Unit Cost</th>
                        <th className="px-3 py-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((l) => {
                        const unit = l.uom || l.stockUom;
                        return (
                          <tr key={l.id} className="border-t border-black/5">
                            <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                            <td className="px-3 py-2">{l.productName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{l.branchName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{l.warehouseName}</td>
                            <td className="px-3 py-2 text-right">{l.qty} {unit}</td>
                            <td className={`px-3 py-2 text-right ${l.receivedQty >= l.qty ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                              {l.receivedQty} {unit}
                            </td>
                            <td className="px-3 py-2 text-right">{fmtSar(l.unitCost)} / {unit}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtSar(l.qty * l.unitCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {po.lines.some((l) => l.uom && l.uom !== l.stockUom) && (
                  <p className="text-[11px] text-muted-foreground">
                    Ordered quantities are in the supplier's unit (e.g. Pallet) — receiving converts each line to its stock
                    unit automatically before crediting the branch's sellable stock.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Lines Subtotal</span>
                  <span className="text-right">{fmtSar(linesValue)}</span>
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-right">{fmtSar(po.shipping)}</span>
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="text-right font-semibold text-foreground">{fmtSar(po.totalValue)}</span>
                </div>
              </TabsContent>

              <TabsContent value="timeline">
                {historyLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-9 w-full animate-pulse rounded-lg bg-black/5" />
                    ))}
                  </div>
                ) : (history ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No history recorded for this PO yet.</p>
                ) : (
                  <div>
                    {(history ?? []).map((h, i, arr) => (
                      <div key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < arr.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-black/10" />}
                        <span className="mt-1.5 h-[11px] w-[11px] flex-none rounded-full border-2 border-brand bg-white" />
                        <div>
                          <p className="text-sm font-medium">{EVENT_LABELS[h.event] ?? h.event}</p>
                          <p className="text-xs text-muted-foreground">
                            {h.userName ?? "System"} · {fmtDateTime(h.createdAt)}
                            {h.reason ? ` · ${h.reason}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {receivable && (
              <div className="flex justify-end border-t border-black/5 pt-3">
                <Button size="sm" className="h-9 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => onReceive(po)}>
                  Receive Goods
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
