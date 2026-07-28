import { Fragment } from "react";
import { Check, RotateCcw } from "lucide-react";
import { PERMISSION_PAGES } from "@/lib/buildpos/permission-pages";
import type { PermissionActionName } from "@/lib/api/auth";

export type MatrixCell = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
};

export const EMPTY_CELL: MatrixCell = {
  canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false,
};

const ACTIONS: { key: PermissionActionName; label: string; field: keyof MatrixCell }[] = [
  { key: "View", label: "View", field: "canView" },
  { key: "Create", label: "Create", field: "canCreate" },
  { key: "Edit", label: "Edit", field: "canEdit" },
  { key: "Delete", label: "Delete", field: "canDelete" },
  { key: "Approve", label: "Approve", field: "canApprove" },
  { key: "Export", label: "Export", field: "canExport" },
];

const SECTION_ORDER = Array.from(new Set(PERMISSION_PAGES.map((p) => p.section)));

// Shared module x action toggle grid — used both by the Role Permissions tab (editing a role's own
// defaults) and the Custom Permissions dialog (editing one user's overrides on top of their role).
export function PermissionMatrix({
  values,
  overriddenKeys,
  onToggle,
  onReset,
  disabled,
}: {
  values: Record<string, MatrixCell>;
  overriddenKeys?: Set<string>;
  onToggle: (moduleKey: string, action: PermissionActionName) => void;
  onReset?: (moduleKey: string) => void;
  disabled?: boolean;
}) {
  const colSpan = ACTIONS.length + 1 + (onReset ? 1 : 0);
  return (
    <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-black/10">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr className="border-b border-black/10 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Module</th>
            {ACTIONS.map((a) => (
              <th key={a.key} className="px-2 py-2 text-center">{a.label}</th>
            ))}
            {onReset && <th className="px-2 py-2 text-center">Reset</th>}
          </tr>
        </thead>
        <tbody>
          {SECTION_ORDER.map((section) => (
            <Fragment key={section || "general"}>
              <tr className="bg-black/[0.03]">
                <td colSpan={colSpan} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section || "General"}
                </td>
              </tr>
              {PERMISSION_PAGES.filter((p) => p.section === section).map((page) => {
                const cell = values[page.key] ?? EMPTY_CELL;
                const isOverridden = overriddenKeys?.has(page.key);
                return (
                  <tr key={page.key} className={`border-b border-black/5 ${isOverridden ? "bg-brand/5" : ""}`}>
                    <td className="px-3 py-1.5 text-foreground">{page.label}</td>
                    {ACTIONS.map((a) => {
                      const on = cell[a.field];
                      return (
                        <td key={a.key} className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onToggle(page.key, a.key)}
                            aria-pressed={on}
                            aria-label={`${page.label} — ${a.label}`}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                              on
                                ? "border-brand bg-brand text-brand-foreground"
                                : "border-black/15 bg-white text-transparent hover:border-black/30"
                            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      );
                    })}
                    {onReset && (
                      <td className="px-2 py-1.5 text-center">
                        {isOverridden && (
                          <button
                            type="button"
                            onClick={() => onReset(page.key)}
                            title="Reset to role default"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
