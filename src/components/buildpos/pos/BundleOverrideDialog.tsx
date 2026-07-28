import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BundleDto } from "@/lib/api/bundles";

// Phase 4 (BRD §5.7 Business Controls) "Supervisor overrides": a bundle restricted to other
// branches or other customer groups can still be sold with sign-off from a different user holding
// bundle-approval authority — captured here and verified server-side at checkout (same shape as
// VoidOrderDialog's authorizerEmail/authorizerPin; there is no separate pre-validation endpoint).
export function BundleOverrideDialog({
  bundle,
  reason,
  onClose,
  onConfirm,
}: {
  bundle: BundleDto | null;
  reason: string | null;
  onClose: () => void;
  onConfirm: (email: string, pin: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const ready = email.trim() !== "" && pin.trim() !== "";

  function handleClose() {
    setEmail("");
    setPin("");
    onClose();
  }

  return (
    <Dialog open={bundle !== null} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Supervisor Override</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{bundle?.nameEn}</strong> is {reason} — a different
          user with bundle approval authority can override this for this sale.
        </p>
        <div className="space-y-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Supervisor email"
            className="h-9"
          />
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Supervisor PIN"
            className="h-9"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!ready}
            onClick={() => {
              onConfirm(email.trim(), pin.trim());
              handleClose();
            }}
          >
            Add with Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
