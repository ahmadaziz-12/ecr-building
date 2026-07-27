import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPut } from "@/lib/api/client";

// BRD §10.2 (Module 15): self-service PIN set/update — the PIN drives register quick-login, the idle
// unlock, and dual-authorization confirmations. The account password confirms it's really the owner.
export function SetPinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  const pinValid = /^\d{6,}$/.test(newPin);
  const pinsMatch = newPin === confirmPin;

  function reset() {
    setCurrentPassword("");
    setNewPin("");
    setConfirmPin("");
  }

  async function save() {
    if (!currentPassword || !pinValid || !pinsMatch) return;
    setSaving(true);
    try {
      await apiPut("/api/auth/me/pin", { currentPassword, newPin });
      toast.success("PIN updated", { description: "Use it for PIN sign-in, unlocking the register, and authorizations." });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set / Update PIN</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Minimum 6 digits. Your PIN signs you into the register, unlocks it after idle, and confirms
          supervisor authorizations.
        </p>
        <div className="space-y-3">
          <Input
            type="password" autoComplete="current-password" value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password"
          />
          <Input
            type="password" inputMode="numeric" value={newPin}
            onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN (6+ digits)"
            className="font-mono tracking-[0.3em]"
          />
          <Input
            type="password" inputMode="numeric" value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm new PIN"
            className="font-mono tracking-[0.3em]"
          />
          {newPin.length > 0 && !pinValid && <p className="text-[11px] text-critical">PIN must be at least 6 digits, numbers only.</p>}
          {confirmPin.length > 0 && !pinsMatch && <p className="text-[11px] text-critical">PINs don't match.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm" disabled={!currentPassword || !pinValid || !pinsMatch || saving} onClick={save}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
