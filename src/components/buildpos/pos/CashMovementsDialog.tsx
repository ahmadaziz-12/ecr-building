import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { useCashMovements } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function CashMovementsDialog({
  shiftId,
  onClose,
}: {
  shiftId: number | null;
  onClose: () => void;
}) {
  const { data: movements, isLoading } = useCashMovements(shiftId ?? undefined);

  return (
    <Dialog open={shiftId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cash Movements</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="max-h-96 overflow-y-auto rounded-lg border border-black/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Direction</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">By</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((m) => (
                <tr key={m.id} className="border-t border-black/5">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(m.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={m.direction === "In" ? "success" : "warning"}>{m.direction}</Pill>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    <CurrencyText value={fmtSar(m.amount)} />
                  </td>
                  <td className="px-3 py-2">{m.reason}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.createdByName ?? "—"}</td>
                </tr>
              ))}
              {!isLoading && (movements ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No cash-in/cash-out events on this shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
