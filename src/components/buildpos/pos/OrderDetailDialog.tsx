import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { statusTone } from "./shared";
import type { OrderDto } from "@/lib/api/pos";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function OrderDetailDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  return (
    <Dialog open={order !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-base">
                {order.orderNo}
                <Pill tone={statusTone(order.status)}>{order.status}</Pill>
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="mt-0.5 font-medium">{order.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
                <p className="mt-0.5 font-medium">{order.type}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cashier</p>
                <p className="mt-0.5 font-medium">{order.cashierName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
                <p className="mt-0.5 font-medium">{order.paymentStatus}</p>
              </div>
              {order.projectCode && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Code</p>
                  <p className="mt-0.5 font-mono text-xs font-medium">{order.projectCode}</p>
                </div>
              )}
              {order.poReference && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PO Reference</p>
                  <p className="mt-0.5 font-mono text-xs font-medium">{order.poReference}</p>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Discount</th>
                    <th className="px-3 py-2 text-right">Weight</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.productId} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.productName}</td>
                      <td className="px-3 py-2 text-right">{l.qty}</td>
                      <td className="px-3 py-2 text-right">{fmtSar(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{l.lineWeight > 0 ? `${l.lineWeight.toFixed(1)} kg` : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtSar(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right">{fmtSar(order.subTotal)}</span>
              <span className="text-muted-foreground">Discount</span>
              <span className="text-right">-{fmtSar(order.discountTotal)}</span>
              <span className="text-muted-foreground">VAT</span>
              <span className="text-right">{fmtSar(order.vatTotal)}</span>
              {order.feesTotal > 0 && (
                <>
                  <span className="text-muted-foreground">Fees</span>
                  <span className="text-right">{fmtSar(order.feesTotal)}</span>
                </>
              )}
              {order.lines.some((l) => l.lineWeight > 0) && (
                <>
                  <span className="text-muted-foreground">Total Weight</span>
                  <span className="text-right">{order.lines.reduce((s, l) => s + l.lineWeight, 0).toFixed(1)} kg</span>
                </>
              )}
              <span className="font-semibold text-foreground">Grand Total</span>
              <span className="text-right font-semibold text-foreground">{fmtSar(order.grandTotal)}</span>
            </div>

            {order.deliveryOrderNo && (
              <div className="flex items-center justify-between rounded-lg border border-black/5 bg-canvas px-3 py-2 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-medium">
                    <span className="font-mono text-xs">{order.deliveryOrderNo}</span>
                    <Pill tone={statusTone(order.deliveryStage ?? "")}>{order.deliveryStage}</Pill>
                  </p>
                </div>
                <Link to="/delivery/orders" className="text-xs font-medium text-brand hover:underline">Track delivery →</Link>
              </div>
            )}

            {order.payments.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payments</p>
                <div className="flex flex-wrap gap-2">
                  {order.payments.map((p, i) => (
                    <Pill key={i} tone={statusTone(p.status)}>
                      {p.method} · {fmtSar(p.amount)}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
