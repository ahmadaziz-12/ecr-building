import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { statusTone } from "./shared";
import { useCustomerStatement } from "@/lib/api/pos";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function CustomerStatementDialog({ customerId, onClose }: { customerId: number | null; onClose: () => void }) {
  const { data: statement, isLoading } = useCustomerStatement(customerId);

  return (
    <Dialog open={customerId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{statement ? `Statement — ${statement.customerName}` : "Statement"}</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {statement && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-black/5 bg-canvas p-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Credit Limit</p>
                <p className="mt-0.5 font-medium">{fmtSar(statement.creditLimit)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</p>
                <p className="mt-0.5 font-medium">{fmtSar(statement.outstanding)}</p>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">Order #</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Payment</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.orders.map((o) => (
                    <tr key={o.id} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{o.orderNo}</td>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtSar(o.grandTotal)}</td>
                      <td className="px-3 py-2">{o.paymentStatus}</td>
                      <td className="px-3 py-2"><Pill tone={statusTone(o.status)}>{o.status}</Pill></td>
                    </tr>
                  ))}
                  {statement.orders.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No orders yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
