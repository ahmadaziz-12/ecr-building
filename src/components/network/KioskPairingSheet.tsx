import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useClearKioskLockdownPin, useGenerateKioskPairing, useSetKioskLockdownPin, useTerminals,
} from "@/lib/api/admin";

export function KioskPairingSheet({
  terminalId,
  onOpenChange,
}: {
  terminalId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: terminals } = useTerminals(terminalId !== null);
  const terminal = terminals?.find((t) => t.id === terminalId);
  const generatePairing = useGenerateKioskPairing();
  const setLockdownPin = useSetKioskLockdownPin();
  const clearLockdownPin = useClearKioskLockdownPin();

  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  function handleClose(open: boolean) {
    if (!open) setRevealedSecret(null);
    onOpenChange(open);
  }

  function handleGenerate() {
    if (!terminalId) return;
    generatePairing.mutateAsync(terminalId).then((res) => {
      setRevealedSecret(res.pairingSecret);
      toast.success("New pairing code generated — copy it now, it won't be shown again.");
    }).catch((err) => toast.error(err instanceof Error ? err.message : "Failed to generate pairing code."));
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function handleSetPin() {
    if (!terminalId) return;
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      toast.error("PIN must be 4-6 digits.");
      return;
    }
    setLockdownPin.mutateAsync({ terminalId, pin }).then(() => {
      setPin("");
      toast.success("Lockdown PIN set.");
    }).catch((err) => toast.error(err instanceof Error ? err.message : "Failed to set PIN."));
  }

  function handleClearPin() {
    if (!terminalId) return;
    clearLockdownPin.mutateAsync(terminalId)
      .then(() => toast.success("Lockdown PIN cleared."))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to clear PIN."));
  }

  return (
    <Sheet open={terminalId !== null} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {terminal && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Kiosk Pairing</SheetTitle>
              <SheetDescription>{terminal.code} · {terminal.name}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-6">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pairing Code</p>
                {revealedSecret ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                      <code className="flex-1 select-all font-mono text-sm font-semibold tracking-wider">{revealedSecret}</code>
                      <Button size="sm" variant="ghost" onClick={() => handleCopy(revealedSecret)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">This is shown once. Enter it on the kiosk device now — it can't be retrieved again after you close this panel.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {terminal.hasPairingSecret ? "A pairing code has already been issued for this terminal." : "No pairing code has been issued yet."}
                    </p>
                    <Button size="sm" onClick={handleGenerate} disabled={generatePairing.isPending}>
                      {terminal.hasPairingSecret ? "Generate New Code" : "Generate Pairing Code"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="border-t border-black/5 pt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fullscreen Lockdown PIN</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {terminal.hasLockdownPin
                    ? `A ${terminal.lockdownPinLength ?? 4}-digit PIN is set — staff enter it to exit kiosk fullscreen mode.`
                    : "No lockdown PIN is set. Kiosk fullscreen mode can be exited without a PIN."}
                </p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="lockdown-pin" className="text-xs">New PIN (4-6 digits)</Label>
                    <Input
                      id="lockdown-pin"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="1234"
                      inputMode="numeric"
                      className="mt-1"
                    />
                  </div>
                  <Button size="sm" onClick={handleSetPin} disabled={setLockdownPin.isPending}>Set PIN</Button>
                </div>
                {terminal.hasLockdownPin && (
                  <Button size="sm" variant="ghost" className="mt-2 text-critical hover:text-critical" onClick={handleClearPin} disabled={clearLockdownPin.isPending}>
                    Clear PIN
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
