import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard, Pill } from "@/components/buildpos/sections";
import { PermissionMatrix, EMPTY_CELL, type MatrixCell } from "@/components/buildpos/pos/PermissionMatrix";
import { CustomPermissionsDialog } from "@/components/buildpos/pos/CustomPermissionsDialog";
import { PosCeilingsPanel } from "@/components/buildpos/pos/PosCeilingsPanel";
import { PERMISSION_PAGES } from "@/lib/buildpos/permission-pages";
import { useRoles, useRoleUsers, useUpdateRole, useUsers, type ModulePermissionEntry, type PosCeilingsDto, type RoleDto } from "@/lib/api/admin";
import type { PermissionActionName } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

function gridFromRole(role: RoleDto): Record<string, MatrixCell> {
  const grid: Record<string, MatrixCell> = {};
  for (const page of PERMISSION_PAGES) {
    const entry = role.permissions.find((p) => p.module === page.key);
    grid[page.key] = entry
      ? { canView: entry.canView, canCreate: entry.canCreate, canEdit: entry.canEdit, canDelete: entry.canDelete, canApprove: entry.canApprove, canExport: entry.canExport }
      : EMPTY_CELL;
  }
  return grid;
}

const FIELD_BY_ACTION: Record<PermissionActionName, keyof MatrixCell> = {
  View: "canView", Create: "canCreate", Edit: "canEdit", Delete: "canDelete", Approve: "canApprove", Export: "canExport",
};

// BRD §10.1 caps the roster at exactly 5 roles (Cashier, Senior Cashier, Supervisor, Store Manager,
// System Admin) — this page is deliberately fixed-roster (no "+ Add" / delete), matching the
// backend's RolesController which has no Create/Delete endpoint either.
export function RolesPermissionsPage() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: allUsers } = useUsers();
  const updateRole = useUpdateRole();

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [tab, setTab] = useState("permissions");
  const [draft, setDraft] = useState<Record<string, MatrixCell> | null>(null);
  const [ceilingsDraft, setCeilingsDraft] = useState<PosCeilingsDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [customizing, setCustomizing] = useState<{ id: number; name: string; email: string; status: string } | null>(null);

  useEffect(() => {
    if (selectedRoleId === null && roles && roles.length > 0) setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRole) {
      setDraft(gridFromRole(selectedRole));
      setCeilingsDraft(selectedRole.posCeilings);
    }
  }, [selectedRole]);

  const { data: members, isLoading: membersLoading } = useRoleUsers(selectedRoleId, tab === "members");

  const dirty = useMemo(() => {
    if (!selectedRole || !draft || !ceilingsDraft) return false;
    return (
      JSON.stringify(gridFromRole(selectedRole)) !== JSON.stringify(draft)
      || JSON.stringify(selectedRole.posCeilings) !== JSON.stringify(ceilingsDraft)
    );
  }, [selectedRole, draft, ceilingsDraft]);

  function toggle(moduleKey: string, action: PermissionActionName) {
    setDraft((prev) => {
      if (!prev) return prev;
      const field = FIELD_BY_ACTION[action];
      const cell = prev[moduleKey] ?? EMPTY_CELL;
      return { ...prev, [moduleKey]: { ...cell, [field]: !cell[field] } };
    });
  }

  async function save() {
    if (!selectedRole || !draft || !ceilingsDraft) return;
    setSaving(true);
    try {
      const permissions: ModulePermissionEntry[] = PERMISSION_PAGES.map((page) => {
        const cell = draft[page.key] ?? EMPTY_CELL;
        return { module: page.key, ...cell };
      });
      await updateRole.mutateAsync({
        id: selectedRole.id,
        request: {
          description: selectedRole.description,
          approvalCap: selectedRole.approvalCap,
          permissions,
          posCeilings: ceilingsDraft,
        },
      });
      toast.success("Role permissions saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save role permissions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Roles & Permissions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Access control · permission matrix · BRD §10.1 role ladder
        </p>
      </div>

      {rolesLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <SectionCard title="Roles" className="lg:h-fit">
            <div className="space-y-1">
              {(roles ?? []).map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    role.id === selectedRoleId
                      ? "bg-brand text-brand-foreground"
                      : "text-foreground hover:bg-black/[0.04]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 opacity-70" />
                    {role.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                      role.id === selectedRoleId ? "bg-white/20" : "bg-black/5 text-muted-foreground"
                    }`}
                  >
                    <UserCog className="h-3 w-3" /> {role.userCount}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          {selectedRole && (
            <SectionCard>
              <Tabs value={tab} onValueChange={setTab}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-semibold text-foreground">{selectedRole.name}</h2>
                      {selectedRole.isSystem && <Pill tone="info">System role — permissions editable, name protected</Pill>}
                    </div>
                    {selectedRole.description && <p className="mt-0.5 text-xs text-muted-foreground">{selectedRole.description}</p>}
                  </div>
                  <TabsList>
                    <TabsTrigger value="permissions">Role Permissions</TabsTrigger>
                    <TabsTrigger value="ceilings">POS Ceilings</TabsTrigger>
                    <TabsTrigger value="members">Members ({selectedRole.userCount})</TabsTrigger>
                  </TabsList>
                </div>

                {(tab === "permissions" || tab === "ceilings") && draft && ceilingsDraft && (
                  <div className="mb-3 flex justify-end">
                    <Button
                      size="sm" disabled={!dirty || saving} onClick={save}
                      className="bg-brand text-brand-foreground hover:bg-brand/90"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Changes"}
                    </Button>
                  </div>
                )}

                <TabsContent value="permissions">
                  {draft && <PermissionMatrix values={draft} onToggle={toggle} disabled={saving} />}
                </TabsContent>

                <TabsContent value="ceilings">
                  {ceilingsDraft && <PosCeilingsPanel values={ceilingsDraft} onChange={setCeilingsDraft} disabled={saving} />}
                </TabsContent>

                <TabsContent value="members">
                  {membersLoading ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (members ?? []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No users assigned to this role yet.</p>
                  ) : (
                    <div className="divide-y divide-black/5">
                      {(members ?? []).map((member) => (
                        <div key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          </div>
                          <div className="flex flex-none items-center gap-2">
                            <Pill tone={member.status === "Active" ? "success" : "muted"}>{member.status}</Pill>
                            <Button variant="outline" size="sm" onClick={() => setCustomizing(member)}>
                              Customize
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </SectionCard>
          )}
        </div>
      )}

      {customizing && selectedRole && (
        <CustomPermissionsDialog
          open={Boolean(customizing)}
          onOpenChange={(v) => { if (!v) setCustomizing(null); }}
          user={{
            id: customizing.id,
            name: customizing.name,
            email: customizing.email,
            status: customizing.status,
            roleId: selectedRole.id,
            roleName: selectedRole.name,
            branchName: allUsers?.find((u) => u.id === customizing.id)?.branchName ?? null,
          }}
        />
      )}
    </div>
  );
}
