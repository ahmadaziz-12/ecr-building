import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReceivePurchaseOrder, type PurchaseOrderDto } from "@/lib/api/procurement";

type DraftLine = { qty: string; batchNo: string; expiryDate: string };

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

// Per-line goods receipt against a PO's outstanding lines. Defaults every line to its full
// remaining qty; a partial receive is just lowering (or zeroing) individual lines — the backend
// supports PARTIAL and flips the PO to PartialReceive/Received itself.
export function ReceivePoDialog({ po, onClose }: { po: PurchaseOrderDto | null; onClose: () => void }) {
  const receivePo = useReceivePurchaseOrder();
  const [rows, setRows] = useState<Record<number, DraftLine>>({});

  const outstanding = useMemo(() => po?.lines.filter((l) => l.receivedQty < l.qty) ?? [], [po]);

  // Keyed on the PO id (not the object) so a background refetch mid-edit doesn't wipe the
  // cashier's in-progress quantities.
  useEffect(() => {
    if (!po) return;
    setRows(Object.fromEntries(
      po.lines
        .filter((l) => l.receivedQty < l.qty)
        .map((l) => [l.id, { qty: String(l.qty - l.receivedQty), batchNo: "", expiryDate: "" }]),
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.id]);

  function setLine(id: number, patch: Partial<DraftLine>) {
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { qty: "", batchNo: "", expiryDate: "" }), ...patch } }));
  }

  const parsed = outstanding.map((l) => {
    const r = rows[l.id] ?? { qty: "", batchNo: "", expiryDate: "" };
    const qty = r.qty.trim() === "" ? 0 : Number(r.qty);
    const remaining = l.qty - l.receivedQty;
    const invalid = !Number.isFinite(qty) || qty < 0 || qty > remaining;
    return { line: l, draft: r, qty, remaining, invalid };
  });
  const hasInvalid = parsed.some((p) => p.invalid);
  const toReceive = parsed.filter((p) => !p.invalid && p.qty > 0);
  const receiveValue = toReceive.reduce((s, p) => s + p.qty * p.line.unitCost, 0);

  async function handleConfirm() {
    if (!po) return;
    if (hasInvalid) {
      toast.error("Fix the highlighted quantities — each must be between 0 and the remaining qty.");
      return;
    }
    if (toReceive.length === 0) {
      toast.error("Enter a quantity for at least one line.");
      return;
    }
    try {
      await receivePo.mutateAsync({
        id: po.id,
        // Only lines actually being received go to the server — zeroed lines stay outstanding.
        lines: toReceive.map((p) => ({
          lineId: p.line.id,
          qty: p.qty,
          batchNo: p.draft.batchNo.trim() || null,
          expiryDate: p.draft.expiryDate || null,
        })),
      });
      toast.success(`Goods received · ${po.poNo}`, { description: `${toReceive.length} line(s) · ${fmtSar(receiveValue)}` });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receive failed.");
    }
  }

  return (
    <Dialog open={po !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {po && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-base">Receive Goods · {po.poNo}</DialogTitle>
              <DialogDescription>
                {po.supplierName} · {outstanding.length} outstanding line(s). Batch + expiry together create a tracked stock batch on receipt.
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-x-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Warehouse</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-left">Receive Now</th>
                    <th className="px-3 py-2 text-left">Batch</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map(({ line: l, draft: r, remaining, invalid }) => {
                    const unit = l.uom || l.stockUom;
                    return (
                    <tr key={l.id} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.productName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.warehouseName}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{remaining} {unit}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            step="any"
                            value={r.qty}
                            onChange={(e) => setLine(l.id, { qty: e.target.value })}
                            className={`h-8 w-20 ${invalid ? "border-critical focus-visible:ring-critical/40" : ""}`}
                          />
                          <span className="text-xs text-muted-foreground">{unit}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={r.batchNo}
                          placeholder={l.batchNo ?? "—"}
                          onChange={(e) => setLine(l.id, { batchNo: e.target.value })}
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={r.expiryDate}
                          onChange={(e) => setLine(l.id, { expiryDate: e.target.value })}
                          className="h-8 w-36"
                        />
                      </td>
                    </tr>
                    );
                  })}
                  {outstanding.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">All lines on this PO are fully received.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-black/5 pt-3">
              <span className="text-sm text-muted-foreground">
                Receiving <span className="font-semibold text-foreground">{toReceive.length}</span> line(s) ·{" "}
                <span className="font-semibold text-foreground">{fmtSar(receiveValue)}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-9" onClick={onClose} disabled={receivePo.isPending}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-9 bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={handleConfirm}
                  disabled={receivePo.isPending || hasInvalid || toReceive.length === 0}
                >
                  {receivePo.isPending ? "Receiving…" : "Confirm Receipt"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
