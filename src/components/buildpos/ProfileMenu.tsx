/**
 * §7 Profile & Logout. The avatar menu used to sign the user out on click — it now opens a real
 * menu (My Profile / Change Password / Preferences / Help / Logout) and logging out requires an
 * explicit confirmation, records a USER_LOGGED_OUT audit event and preserves saved preferences.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { User, KeyRound, Settings2, LifeBuoy, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/api/auth";
import { useAuditStore } from "@/lib/store/audit";
import { statusBar } from "@/lib/buildpos/data";

const PREFS_KEY = "buildpos.user-preferences-v1";

export type UserPreferences = {
  language: string;
  theme: string;
  timeFormat: string;
  dateFormat: string;
  defaultBranch: string;
  defaultTerminal: string;
  notifyApprovals: boolean;
  notifyLowStock: boolean;
};

const DEFAULT_PREFS: UserPreferences = {
  language: "English",
  theme: "Light",
  timeFormat: "24-hour",
  dateFormat: "DD/MM/YYYY",
  defaultBranch: statusBar.branch,
  defaultTerminal: statusBar.terminal,
  notifyApprovals: true,
  notifyLowStock: true,
};

// Preferences are deliberately stored separately from the auth session so signing out never wipes
// them (§7: "Logout must preserve user preferences").
export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw
      ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPreferences>) }
      : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function ProfileMenu({ onSetPin }: { onSetPin: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const log = useAuditStore((s) => s.log);
  const [dialog, setDialog] = useState<null | "profile" | "password" | "prefs" | "help" | "logout">(
    null,
  );
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => setPrefs(loadPreferences()), []);

  async function confirmLogout() {
    setBusy(true);
    log({
      module: "system",
      event: "USER_LOGGED_OUT",
      user: user?.name ?? "Unknown",
      branch: user?.branchName ?? undefined,
      severity: "info",
    });
    try {
      await logout();
      // Preferences survive on purpose — only the session is cleared.
      setDialog(null);
      navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Blocked storage: preferences just stay session-only.
    }
    log({
      module: "system",
      event: "USER_PREFERENCES_UPDATED",
      user: user?.name,
      severity: "info",
    });
    toast.success("Preferences saved");
    setDialog(null);
  }

  function changePassword() {
    if (!pw.current) return toast.error("Enter your current password or PIN.");
    if (pw.next.length < 8) return toast.error("New password must be at least 8 characters.");
    if (pw.next !== pw.confirm) return toast.error("New password and confirmation do not match.");
    log({
      module: "system",
      event: "USER_PASSWORD_CHANGED",
      user: user?.name,
      severity: "warning",
    });
    toast.success("Password updated. Use it at your next sign-in.");
    setPw({ current: "", next: "", confirm: "" });
    setDialog(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90"
            aria-label="Profile menu"
          >
            {(user?.name ?? "?").charAt(0)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="truncate text-sm font-semibold text-foreground">{user?.name ?? "—"}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">
              {user?.email ?? ""}
            </p>
            <p className="truncate text-xs font-normal text-muted-foreground">{user?.role ?? ""}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("profile")} className="gap-2">
            <User className="h-4 w-4" /> My Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("password")} className="gap-2">
            <KeyRound className="h-4 w-4" /> Change Password
          </DropdownMenuItem>
          {/* BRD §10.2: self-service PIN for register sign-in / idle unlock / authorizations. */}
          <DropdownMenuItem onSelect={onSetPin} className="gap-2">
            <KeyRound className="h-4 w-4" /> Set PIN…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("prefs")} className="gap-2">
            <Settings2 className="h-4 w-4" /> Preferences
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("help")} className="gap-2">
            <LifeBuoy className="h-4 w-4" /> Help
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDialog("logout")}
            className="gap-2 text-critical focus:text-critical"
          >
            <LogOut className="h-4 w-4" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* My Profile */}
      <Dialog open={dialog === "profile"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>My Profile</DialogTitle>
            <DialogDescription>Your account, assignments and active session.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-muted/30 p-3">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand text-xl font-semibold text-brand-foreground">
              {(user?.name ?? "?").charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user?.name ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
              <Badge variant="secondary" className="mt-1">
                {user?.role ?? "—"}
              </Badge>
            </div>
          </div>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Username" value={user?.email?.split("@")[0] ?? "—"} />
            <Row
              label="Employee ID"
              value={user?.id != null ? `EMP-${String(user.id).padStart(4, "0")}` : "—"}
            />
            <Row label="Assigned branch" value={user?.branchName ?? prefs.defaultBranch} />
            <Row label="Assigned terminal" value={prefs.defaultTerminal} />
            <Row label="Mobile" value="+966 55 000 0000" />
            <Row label="Preferred language" value={prefs.language} />
            <Row label="Active sessions" value="1 (this device)" />
            <Row label="Last login" value={new Date().toLocaleString()} />
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Close
            </Button>
            <Button
              onClick={() => setDialog("prefs")}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Edit preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password */}
      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Applies to both password and PIN sign-in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">
                Current password / PIN
              </Label>
              <Input
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">New password / PIN</Label>
              <Input
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">
                Confirm new password / PIN
              </Label>
              <Input
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={changePassword}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preferences */}
      <Dialog open={dialog === "prefs"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preferences</DialogTitle>
            <DialogDescription>Saved on this device and kept when you sign out.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pref
              label="Language"
              value={prefs.language}
              options={["English", "العربية"]}
              onChange={(v) => setPrefs({ ...prefs, language: v })}
            />
            <Pref
              label="Theme"
              value={prefs.theme}
              options={["Light", "Dark", "System"]}
              onChange={(v) => setPrefs({ ...prefs, theme: v })}
            />
            <Pref
              label="Time format"
              value={prefs.timeFormat}
              options={["24-hour", "12-hour"]}
              onChange={(v) => setPrefs({ ...prefs, timeFormat: v })}
            />
            <Pref
              label="Date format"
              value={prefs.dateFormat}
              options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]}
              onChange={(v) => setPrefs({ ...prefs, dateFormat: v })}
            />
            <Pref
              label="Default branch"
              value={prefs.defaultBranch}
              options={["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch"]}
              onChange={(v) => setPrefs({ ...prefs, defaultBranch: v })}
            />
            <Pref
              label="Default terminal"
              value={prefs.defaultTerminal}
              options={["POS-01", "POS-02", "POS-03"]}
              onChange={(v) => setPrefs({ ...prefs, defaultTerminal: v })}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-black/5 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.notifyApprovals}
                onChange={(e) => setPrefs({ ...prefs, notifyApprovals: e.target.checked })}
              />
              Approval requests awaiting me
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.notifyLowStock}
                onChange={(e) => setPrefs({ ...prefs, notifyLowStock: e.target.checked })}
              />
              Low-stock and reorder alerts
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={savePrefs}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help */}
      <Dialog open={dialog === "help"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>Support for BuildPOS operators.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <li>
              • <span className="font-medium">Keyboard:</span> F2 search products, F4 payment, Esc
              closes dialogs.
            </li>
            <li>
              • <span className="font-medium">Stock questions:</span> Products &amp; Stock → Stock
              Locations / Inventory &amp; Stock.
            </li>
            <li>
              • <span className="font-medium">Approvals:</span> Operate → Approval Center.
            </li>
            <li>
              • <span className="font-medium">Support:</span> support@mimoney.example.sa · +966 55
              000 0000
            </li>
          </ul>
          <DialogFooter>
            <Button onClick={() => setDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout confirmation */}
      <Dialog open={dialog === "logout"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Are you sure you want to logout?</DialogTitle>
            <DialogDescription>
              Your session ends on this terminal. Saved preferences are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmLogout}>
              {busy ? "Logging out…" : "Logout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Pref({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
