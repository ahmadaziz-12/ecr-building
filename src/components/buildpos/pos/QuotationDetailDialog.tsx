import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { statusTone } from "./shared";
import type { QuotationDto } from "@/lib/api/pos";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function QuotationDetailDialog({ quotation, onClose }: { quotation: QuotationDto | null; onClose: () => void }) {
  return (
    <Dialog open={quotation !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {quotation && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-base">
                {quotation.quoteNo}
                <Pill tone={statusTone(quotation.status)}>
                  {quotation.status}
                  {quotation.convertedOrderNo ? ` → ${quotation.convertedOrderNo}` : ""}
                </Pill>
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="mt-0.5 font-medium">{quotation.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Created By</p>
                <p className="mt-0.5 font-medium">{quotation.createdByName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valid Until</p>
                <p className="mt-0.5 font-medium">
                  {new Date(quotation.validUntil).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Created</p>
                <p className="mt-0.5 font-medium">
                  {new Date(quotation.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.lines.map((l) => (
                    <tr key={l.productId} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.productName}</td>
                      <td className="px-3 py-2 text-right">{l.qty}</td>
                      <td className="px-3 py-2 text-right">{fmtSar(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtSar(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right">{fmtSar(quotation.subTotal)}</span>
              <span className="text-muted-foreground">Discount</span>
              <span className="text-right">-{fmtSar(quotation.discountTotal)}</span>
              <span className="text-muted-foreground">VAT</span>
              <span className="text-right">{fmtSar(quotation.vatTotal)}</span>
              <span className="font-semibold text-foreground">Grand Total</span>
              <span className="text-right font-semibold text-foreground">{fmtSar(quotation.grandTotal)}</span>
            </div>

            {quotation.notes && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                <p className="text-sm text-muted-foreground">{quotation.notes}</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
