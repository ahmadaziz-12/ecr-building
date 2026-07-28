import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OrderDto } from "@/lib/api/pos";
import { useZatcaInvoiceByOrder } from "@/lib/api/zatca";
import { usePrintReceipt } from "@/lib/api/print";
import { useDevices } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { qzIsConnected, qzPrintRaw } from "@/lib/qz";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function ReceiptDialog({
  order,
  terminalId,
  onClose,
}: {
  order: OrderDto | null;
  terminalId: number | null;
  onClose: () => void;
}) {
  const { data: invoice } = useZatcaInvoiceByOrder(order?.id);
  const { data: devices } = useDevices(!!order);
  const printReceipt = usePrintReceipt();
  // Keyed by order id (not a plain boolean) and stored in a ref, not state: a ref mutation is
  // visible immediately to any re-entrant/duplicate invocation in the same tick, whereas a
  // state update is only visible after React re-renders — a boolean guard can let two
  // near-simultaneous effect firings both read the old "not yet printed" value and both dispatch
  // a real print job to the physical printer.
  const autoPrintedOrderId = useRef<number | null>(null);

  const qzPrinterName =
    devices?.find((d) => d.terminalId === terminalId && d.type === "ReceiptPrinter")
      ?.qzPrinterName ?? null;

  async function dispatchPrint() {
    if (!order) return;
    const job = await printReceipt.mutateAsync({ orderId: order.id, terminalId });
    if (qzIsConnected() && qzPrinterName) await qzPrintRaw(job.escPosBase64, qzPrinterName);
    return job;
  }

  useEffect(() => {
    if (order && autoPrintedOrderId.current !== order.id) {
      autoPrintedOrderId.current = order.id;
      dispatchPrint().catch(() => {});
    }
    if (!order) autoPrintedOrderId.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  async function handlePrint() {
    if (!order) return;
    try {
      await dispatchPrint();
      toast.success(
        qzIsConnected() && qzPrinterName
          ? "Sent to physical receipt printer"
          : "Sent to receipt printer",
        {
          description:
            qzIsConnected() && qzPrinterName
              ? `Via QZ Tray → ${qzPrinterName}`
              : "Rendered as ESC/POS bytes (virtual printer).",
        },
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Print failed");
    }
  }

  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-0">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-foreground">
            Receipt · {order.orderNo}
          </DialogTitle>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 font-mono text-xs text-foreground">
          <div className="text-center">
            <p className="font-bold">{order.branchName}</p>
            <p className="text-muted-foreground">TAX INVOICE / فاتورة ضريبية</p>
          </div>
          <div className="mt-3 space-y-0.5 border-b border-dashed border-black/20 pb-2">
            <div className="flex justify-between">
              <span>Order</span>
              <span>{order.orderNo}</span>
            </div>
            <div className="flex justify-between">
              <span>Date</span>
              <span>
                {new Date(order.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Customer</span>
              <span>{order.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier</span>
              <span>{order.cashierName}</span>
            </div>
          </div>

          <div className="mt-2 space-y-1 border-b border-dashed border-black/20 pb-2">
            {order.lines.map((l) => (
              <div key={l.productId}>
                <div className="flex justify-between gap-2">
                  <span className="truncate">
                    {l.productName} x{l.qty}
                    {l.uom ? ` ${l.uom}` : ""}
                    {l.lengthM != null &&
                      (l.heightM != null && l.widthM != null
                        ? ` (${l.lengthM}×${l.widthM}×${l.heightM}m)`
                        : l.widthM != null
                          ? ` (${l.lengthM}×${l.widthM}m)`
                          : ` (${l.lengthM}m)`)}
                    {/* Phase 2 (BRD §5.1): a Buy-X-Get-Y free unit is DiscountPct=100 — "FREE" reads
                        honestly, "(-100%)" reads like an oddly large discount. */}
                    {l.discountPct === 100 ? (
                      <span className="text-success"> (FREE)</span>
                    ) : l.discountPct > 0 ? (
                      <span className="text-warning"> (-{l.discountPct}%)</span>
                    ) : null}
                  </span>
                  <span className="flex-none">{money(l.lineTotal)}</span>
                </div>
                {/* BRD §5.2/§5.4: every bundle constituent is its own line item, tagged with the
                    bundle it came from, so the receipt itemizes the kit instead of showing one
                    opaque "bundle" row. */}
                {l.bundleName && <p className="text-muted-foreground"> · {l.bundleName}</p>}
                {/* Total kg for the line — matters for bundle/pallet items (rebar, cement) where the
                    physical load size is what the yard crew and delivery truck actually care about. */}
                {l.lineWeight > 0 && (
                  <p className="text-muted-foreground"> {l.lineWeight.toFixed(1)} kg</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-0.5 border-b border-dashed border-black/20 pb-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(order.subTotal)}</span>
            </div>
            {/* Bundle savings shown as their own line (BRD §5.2: "Bundle Discount -12 SAR") rather
                than folded into the generic Discount total alongside coupon/contractor/manual
                discounts — the two are additive and never double-count the same riyal. */}
            {order.discountTotal - order.bundleDiscountTotal > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{money(order.discountTotal - order.bundleDiscountTotal)}</span>
              </div>
            )}
            {order.bundleDiscountTotal > 0 && (
              <div className="flex justify-between">
                <span>Bundle Discount</span>
                <span>-{money(order.bundleDiscountTotal)}</span>
              </div>
            )}
            {order.lines.some((l) => l.lineWeight > 0) && (
              <div className="flex justify-between text-muted-foreground">
                <span>Total Weight</span>
                <span>{order.lines.reduce((s, l) => s + l.lineWeight, 0).toFixed(1)} kg</span>
              </div>
            )}
            {order.fees.map((f) => (
              <div key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <span>{money(f.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span>VAT</span>
              <span>{money(order.vatTotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL</span>
              <span>{money(order.grandTotal)}</span>
            </div>
          </div>

          <div className="mt-2 space-y-0.5 border-b border-dashed border-black/20 pb-2">
            {order.payments.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>{p.method}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </div>

          {order.loyaltyPointsBalance !== null && (
            <div className="mt-2 space-y-0.5 border-b border-dashed border-black/20 pb-2">
              {order.loyaltyPointsRedeemed !== null && order.loyaltyPointsRedeemed > 0 && (
                <div className="flex justify-between">
                  <span>Points redeemed</span>
                  <span>-{order.loyaltyPointsRedeemed}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Points earned</span>
                <span>+{order.loyaltyPointsEarned ?? 0}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Points balance</span>
                <span>{order.loyaltyPointsBalance}</span>
              </div>
              {order.loyaltyNextTierThreshold !== null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Next tier at</span>
                  <span>{order.loyaltyNextTierThreshold} pts</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col items-center gap-1">
            {invoice?.qrCodeBase64 ? (
              <>
                <QRCodeSVG value={invoice.qrCodeBase64} size={120} />
                <p className="text-[10px] text-muted-foreground">
                  ZATCA Cleared · {invoice.invoiceNumber}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground">ZATCA invoice pending…</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 p-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={printReceipt.isPending}
            className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {printReceipt.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}{" "}
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
