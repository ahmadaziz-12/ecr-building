import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateReturnPolicyConfig, type ReturnPolicyConfigDto } from "@/lib/api/finance";

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ReturnPolicySettingsDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: ReturnPolicyConfigDto;
}) {
  const [dualAuthThreshold, setDualAuthThreshold] = useState("");
  const [standardDays, setStandardDays] = useState("");
  const [surplusDays, setSurplusDays] = useState("");
  const update = useUpdateReturnPolicyConfig();

  useEffect(() => {
    if (open) {
      setDualAuthThreshold(String(config.dualAuthCashThreshold));
      setStandardDays(String(config.standardWindowDays));
      setSurplusDays(String(config.surplusWindowDays));
    }
  }, [open, config]);

  const dualAuthNum = Number(dualAuthThreshold);
  const standardNum = Number(standardDays);
  const surplusNum = Number(surplusDays);
  const valid = dualAuthNum >= 0 && Number.isInteger(standardNum) && standardNum >= 0 && Number.isInteger(surplusNum) && surplusNum >= 0;

  async function submit() {
    if (!valid) return;
    try {
      await update.mutateAsync({
        dualAuthCashThreshold: dualAuthNum,
        standardWindowDays: standardNum,
        surplusWindowDays: surplusNum,
      });
      toast.success("Return policy updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save these settings.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return Policy Settings</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <FormField
            label="Dual-authorization cash threshold (SAR)"
            hint="Cash refunds above this amount need a second supervisor confirming with their own PIN. BRD default: 500."
          >
            <Input type="number" step="1" min="0" value={dualAuthThreshold} onChange={(e) => setDualAuthThreshold(e.target.value)} className="h-9" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Standard return window (days)" hint="BRD default: 15">
              <Input type="number" step="1" min="0" value={standardDays} onChange={(e) => setStandardDays(e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Surplus return window (days)" hint="BRD default: 90">
              <Input type="number" step="1" min="0" value={surplusDays} onChange={(e) => setSurplusDays(e.target.value)} className="h-9" />
            </FormField>
          </div>
        </div>
        {!valid && <p className="text-[11px] text-critical">All three values must be zero or greater, and the windows must be whole days.</p>}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || update.isPending}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
