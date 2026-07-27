import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PermissionMatrix, EMPTY_CELL, type MatrixCell } from "@/components/buildpos/pos/PermissionMatrix";
import { PERMISSION_PAGES } from "@/lib/buildpos/permission-pages";
import {
  useRoles, useUserPermissionOverrides, useSaveUserPermissionOverrides,
  type ModulePermissionEntry, type UserPermissionOverrideEntry, type RoleMemberDto,
} from "@/lib/api/admin";
import type { PermissionActionName } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const FIELD_BY_ACTION: Record<PermissionActionName, keyof MatrixCell> = {
  View: "canView", Create: "canCreate", Edit: "canEdit", Delete: "canDelete", Approve: "canApprove", Export: "canExport",
};

function roleGridFromEntries(entries: ModulePermissionEntry[]): Record<string, MatrixCell> {
  const grid: Record<string, MatrixCell> = {};
  for (const e of entries) {
    grid[e.module] = {
      canView: e.canView, canCreate: e.canCreate, canEdit: e.canEdit,
      canDelete: e.canDelete, canApprove: e.canApprove, canExport: e.canExport,
    };
  }
  return grid;
}

// BRD-style per-user permission override — overrides sit on top of the user's role defaults for one
// page at a time. Reconstructing which cells are already overridden is done by diffing the fetched
// EFFECTIVE grid (role + override, merged server-side) against the role's own pure default grid —
// wherever they differ, that action must already be an explicit override.
export function CustomPermissionsDialog({
  open, onOpenChange, user,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: RoleMemberDto & { roleId: number; roleName: string; branchName: string | null };
}) {
  const { data: roles } = useRoles(open);
  const { data: effectiveEntries, isLoading } = useUserPermissionOverrides(user.id, open);
  const saveOverrides = useSaveUserPermissionOverrides();
  const [saving, setSaving] = useState(false);

  const roleDefault = useMemo(() => {
    const role = roles?.find((r) => r.id === user.roleId);
    return role ? roleGridFromEntries(role.permissions) : {};
  }, [roles, user.roleId]);

  // overrides[moduleKey][field] = explicit boolean; a module absent (or with no fields set) means
  // "fully inherits the role" for that page.
  const [overrides, setOverrides] = useState<Record<string, Partial<MatrixCell>>>({});

  useEffect(() => {
    if (!open || !effectiveEntries || Object.keys(roleDefault).length === 0) return;
    const seeded: Record<string, Partial<MatrixCell>> = {};
    for (const entry of effectiveEntries) {
      const base = roleDefault[entry.module] ?? EMPTY_CELL;
      const diff: Partial<MatrixCell> = {};
      (Object.keys(FIELD_BY_ACTION) as PermissionActionName[]).forEach((action) => {
        const field = FIELD_BY_ACTION[action];
        if (entry[field] !== base[field]) diff[field] = entry[field];
      });
      if (Object.keys(diff).length > 0) seeded[entry.module] = diff;
    }
    setOverrides(seeded);
    // Only re-seed when the dialog (re)opens for this user / once the two source datasets have
    // both landed — not on every render, or a user's own in-progress toggles would be clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveEntries !== undefined, Object.keys(roleDefault).length > 0]);

  const displayGrid = useMemo(() => {
    const grid: Record<string, MatrixCell> = {};
    for (const page of PERMISSION_PAGES) {
      const base = roleDefault[page.key] ?? EMPTY_CELL;
      const over = overrides[page.key];
      grid[page.key] = over ? { ...base, ...over } : base;
    }
    return grid;
  }, [roleDefault, overrides]);

  const overriddenKeys = useMemo(
    () => new Set(Object.entries(overrides).filter(([, v]) => Object.keys(v).length > 0).map(([k]) => k)),
    [overrides],
  );

  function toggle(moduleKey: string, action: PermissionActionName) {
    const field = FIELD_BY_ACTION[action];
    const base = roleDefault[moduleKey] ?? EMPTY_CELL;
    const current = overrides[moduleKey]?.[field] ?? base[field];
    setOverrides((prev) => ({ ...prev, [moduleKey]: { ...prev[moduleKey], [field]: !current } }));
  }

  function resetRow(moduleKey: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[moduleKey];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const entries: UserPermissionOverrideEntry[] = Object.entries(overrides)
        .filter(([, v]) => Object.keys(v).length > 0)
        .map(([module, v]) => ({
          module,
          canView: v.canView ?? null, canCreate: v.canCreate ?? null, canEdit: v.canEdit ?? null,
          canDelete: v.canDelete ?? null, canApprove: v.canApprove ?? null, canExport: v.canExport ?? null,
        }));
      await saveOverrides.mutateAsync({ userId: user.id, entries });
      toast.success("Custom permissions saved", { description: "Enforced by the server on their next request — no re-login needed." });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save custom permissions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Custom Permissions — {user.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {user.roleName}
          {user.branchName ? ` · ${user.branchName}` : ""} · {user.email}
        </p>
        <p className="rounded-lg bg-black/[0.03] p-2.5 text-[11px] text-muted-foreground">
          These override the role defaults for this user only, and are enforced by the server — takes
          effect on their next request, no re-login required.
        </p>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <PermissionMatrix values={displayGrid} overriddenKeys={overriddenKeys} onToggle={toggle} onReset={resetRow} disabled={saving} />
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm" disabled={saving || isLoading} onClick={save}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
