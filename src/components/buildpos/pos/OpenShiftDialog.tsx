import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOpenShift, useShiftTerminals } from "@/lib/api/pos";
import { SARIcon } from "@/lib/buildpos/currency";

export function OpenShiftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // The cashier-shift module's own terminal list, not Network → Terminals: that endpoint needs a
  // Network permission a cashier's role may not carry, and its 403 left this dropdown empty — which
  // is why "Riyadh Main Yard - Till 1" looked unregistered when it was only unreadable. The backend
  // already scopes the list to the caller's branch, so there is no client-side branch filter here to
  // disagree with it.
  const { data: terminals, isLoading, isError, error } = useShiftTerminals(open);
  const list = terminals ?? [];
  // Only worth showing when the list spans branches; a branch-scoped cashier already knows theirs.
  const showBranch = new Set(list.map((t) => t.branchId)).size > 1;

  const [terminalId, setTerminalId] = useState<string>("");
  const [openingFloat, setOpeningFloat] = useState("1000");
  const openShift = useOpenShift();

  function reset() {
    setTerminalId("");
    setOpeningFloat("1000");
  }

  const floatValid = Number.isFinite(Number(openingFloat)) && Number(openingFloat) >= 0;

  async function submit() {
    if (!terminalId || !floatValid) return;
    try {
      await openShift.mutateAsync({ terminalId: Number(terminalId), openingFloat: Number(openingFloat) || 0 });
      toast.success("Shift opened");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open a shift on this terminal.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Open Shift</DialogTitle></DialogHeader>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal</label>
          <Select value={terminalId} onValueChange={setTerminalId}>
            <SelectTrigger><SelectValue placeholder={isLoading ? "Loading terminals…" : "Select terminal…"} /></SelectTrigger>
            <SelectContent>
              {list.map((t) => (
                // A till someone else is already on stays visible but unselectable — the backend
                // rejects a second shift on it anyway, and dropping it from the list is exactly the
                // "my terminal is missing" symptom this dialog was reported for.
                <SelectItem key={t.id} value={String(t.id)} disabled={t.openShiftBlockedBy !== null}>
                  {showBranch ? `${t.branchName} — ${t.name}` : t.name}
                  {t.openShiftBlockedBy ? ` · shift open (${t.openShiftBlockedBy})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isError && (
            <p className="mt-1.5 text-[11px] text-critical">
              {error instanceof Error ? error.message : "Could not load terminals."} Retry, or ask an administrator to check your Cashier Shifts access.
            </p>
          )}
          {!isLoading && !isError && list.length === 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">No terminals are registered for your branch. Ask an administrator to register one under Network → Terminals.</p>
          )}
          {!isLoading && !isError && list.length > 0 && list.every((t) => t.openShiftBlockedBy !== null) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">Every terminal you can use already has an open shift — it must be closed before a new one starts.</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening Float (<SARIcon />)</label>
          <Input type="number" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!terminalId || !floatValid || openShift.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {openShift.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Open Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
