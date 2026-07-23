import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOpenShift } from "@/lib/api/pos";
import { useTerminals, type TerminalDto } from "@/lib/api/admin";

export function OpenShiftDialog({ open, onOpenChange, branchId }: { open: boolean; onOpenChange: (v: boolean) => void; branchId: number | null }) {
  const { data: terminals } = useTerminals(open);
  const branchTerminals: TerminalDto[] = (terminals ?? []).filter((t) => !branchId || t.branchId === branchId);

  const [terminalId, setTerminalId] = useState<string>("");
  const [openingFloat, setOpeningFloat] = useState("1000");
  const openShift = useOpenShift();

  function reset() {
    setTerminalId("");
    setOpeningFloat("1000");
  }

  async function submit() {
    if (!terminalId) return;
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
            <SelectTrigger><SelectValue placeholder="Select terminal…" /></SelectTrigger>
            <SelectContent>
              {branchTerminals.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening Float (ر.س)</label>
          <Input type="number" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!terminalId || openShift.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {openShift.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Open Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
