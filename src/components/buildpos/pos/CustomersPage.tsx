import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RowActionsMenu,
  statusTone,
  FilterBar,
  emptyFilterDraft,
  usePagination,
  PaginationBar,
  exportToCsv,
  type FilterFieldDef,
} from "./shared";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { CustomerStatementDialog } from "./CustomerStatementDialog";
import { useArchiveCustomer, useCustomers, type CustomerDto } from "@/lib/api/pos";

const TABS = ["All", "Walk-in", "Retail", "Contractor / B2B", "Loyalty"] as const;
type Tab = (typeof TABS)[number];
const CUSTOMER_TYPES = ["WalkIn", "Retail", "Contractor", "B2B"];
const TYPE_LABELS: Record<string, string> = {
  WalkIn: "Walk-in",
  Retail: "Retail",
  Contractor: "Contractor",
  B2B: "B2B",
};
const CREDIT_STATUSES = ["OverLimit", "HasCredit", "NoCredit"];
const CREDIT_LABELS: Record<string, string> = {
  OverLimit: "Over Limit",
  HasCredit: "Has Credit",
  NoCredit: "No Credit",
};
const PAGE_SIZE = 10;

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function tierTone(tier: string): "success" | "warning" | "info" | "muted" {
  switch (tier) {
    case "Platinum":
      return "success";
    case "Gold":
      return "warning";
    case "Silver":
      return "info";
    default:
      return "muted";
  }
}
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

const FIELDS: FilterFieldDef[] = [
  { kind: "date", key: "dateFrom", placeholder: "Registered From" },
  { kind: "date", key: "dateTo", placeholder: "Registered To" },
  {
    kind: "select",
    key: "type",
    placeholder: "Customer Type",
    options: CUSTOMER_TYPES,
    labels: TYPE_LABELS,
  },
  {
    kind: "select",
    key: "creditStatus",
    placeholder: "Credit Status",
    options: CREDIT_STATUSES,
    labels: CREDIT_LABELS,
  },
  { kind: "select", key: "status", placeholder: "Status", options: ["Active", "Inactive"] },
  { kind: "search", key: "search", placeholder: "Search name, phone, VAT #…" },
];

export function CustomersPage() {
  const navigate = useNavigate();
  const { data: customers, refetch, isFetching } = useCustomers(true);
  const archiveCustomer = useArchiveCustomer();

  const [tab, setTab] = useState<Tab>("All");
  const [draft, setDraft] = useState<Record<string, string>>(() => emptyFilterDraft(FIELDS));
  const [applied, setApplied] = useState<Record<string, string>>(draft);
  const [formCustomer, setFormCustomer] = useState<CustomerDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statementId, setStatementId] = useState<number | null>(null);

  const all = customers ?? [];
  const filtered = useMemo(() => {
    return all.filter((c) => {
      if (tab === "Walk-in" && c.type !== "WalkIn") return false;
      if (tab === "Retail" && c.type !== "Retail") return false;
      if (tab === "Contractor / B2B" && c.type !== "Contractor" && c.type !== "B2B") return false;
      if (tab === "Loyalty" && !c.loyaltyEnrolled) return false;
      if (applied.type && c.type !== applied.type) return false;
      if (applied.status && c.status !== applied.status) return false;
      if (
        applied.creditStatus === "OverLimit" &&
        !(c.outstanding > c.creditLimit && c.creditLimit > 0)
      )
        return false;
      if (applied.creditStatus === "HasCredit" && !(c.creditLimit > 0)) return false;
      if (applied.creditStatus === "NoCredit" && c.creditLimit > 0) return false;
      if (
        (applied.dateFrom || applied.dateTo) &&
        !inDateRange(c.createdAt, applied.dateFrom, applied.dateTo)
      )
        return false;
      if (applied.search) {
        const t = applied.search.trim().toLowerCase();
        if (
          t &&
          !c.nameEn.toLowerCase().includes(t) &&
          !(c.phone ?? "").includes(t) &&
          !(c.vatNo ?? "").includes(t)
        )
          return false;
      }
      return true;
    });
  }, [all, tab, applied]);

  const pagination = usePagination(filtered, PAGE_SIZE, JSON.stringify(applied) + tab);

  const kpis = useMemo(() => {
    const b2b = all.filter((c) => c.type === "Contractor" || c.type === "B2B");
    const loyalty = all.filter((c) => c.loyaltyEnrolled);
    const outstanding = all.reduce((s, c) => s + c.outstanding, 0);
    return [
      { label: "Total Customers", value: all.length, sub: "All types", tone: "success" as const },
      {
        label: "Contractor / B2B",
        value: b2b.length,
        sub: `${b2b.filter((c) => c.creditLimit > 0).length} with credit`,
        tone: "info" as const,
      },
      {
        label: "Loyalty Members",
        value: loyalty.length,
        sub: "Enrolled",
        tone: "success" as const,
      },
      {
        label: "Credit Outstanding",
        value: fmtSar(outstanding),
        sub: `${all.filter((c) => c.outstanding > c.creditLimit && c.creditLimit > 0).length} over limit`,
        tone: "warning" as const,
      },
    ];
  }, [all]);

  async function toggleArchive(c: CustomerDto) {
    try {
      await archiveCustomer.mutateAsync(c.id);
      toast.success(c.status === "Active" ? `${c.nameEn} archived` : `${c.nameEn} reactivated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this customer.");
    }
  }

  function handleExport() {
    exportToCsv(
      "customers.csv",
      ["ID", "Name", "Type", "Phone", "VAT No.", "Credit Limit", "Outstanding", "Status"],
      filtered.map((c) => [
        `CUS-${String(c.id).padStart(5, "0")}`,
        c.nameEn,
        c.type,
        c.phone ?? "",
        c.vatNo ?? "",
        c.creditLimit,
        c.outstanding,
        c.status,
      ]),
    );
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Operate"
        title="Customers"
        desc="Walk-in, retail, contractor/B2B customers and loyalty profiles."
        primary="Add Customer"
        onPrimary={() => {
          setFormCustomer(null);
          setFormOpen(true);
        }}
        onRefresh={() => refetch()}
        onExport={handleExport}
      />

      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {tab === t && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      <FilterBar
        fields={FIELDS}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => {
          const empty = emptyFilterDraft(FIELDS);
          setDraft(empty);
          setApplied(empty);
        }}
        resultLabel={`${filtered.length} of ${all.length}${isFetching ? " · refreshing…" : ""}`}
      />

      <KpiGrid items={kpis} />

      <SectionCard title="Customer Directory" desc={`${filtered.length} records`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name (EN/AR)</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>VAT No.</TableHead>
                <TableHead className="text-right">Credit Limit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Loyalty</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageRows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">
                    CUS-{String(c.id).padStart(5, "0")}
                  </TableCell>
                  <TableCell>
                    {c.nameEn}
                    {c.nameAr ? ` / ${c.nameAr}` : ""}
                    {c.projectName ? (
                      <span className="block text-xs text-muted-foreground">{c.projectName}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.vatNo ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {c.creditLimit > 0 ? fmtSar(c.creditLimit) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{fmtSar(c.outstanding)}</TableCell>
                  <TableCell>
                    <Pill tone={statusTone(c.status)}>{c.status}</Pill>
                  </TableCell>
                  <TableCell>
                    {c.loyaltyEnrolled ? (
                      <div className="flex items-center gap-1.5">
                        <Pill tone={tierTone(c.loyaltyTier)}>{c.loyaltyTier}</Pill>
                        <span className="text-xs text-muted-foreground">
                          {c.loyaltyPoints.toLocaleString("en-US")} pts
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not enrolled</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        { label: "View Statement", onClick: () => setStatementId(c.id) },
                        {
                          label: "Edit",
                          onClick: () => {
                            setFormCustomer(c);
                            setFormOpen(true);
                          },
                        },
                        "separator",
                        ...(c.loyaltyEnrolled
                          ? [
                              {
                                label: "View Loyalty",
                                onClick: () =>
                                  navigate({
                                    to: "/finance/loyalty",
                                    search: { customerId: c.id },
                                  }),
                              },
                            ]
                          : []),
                        {
                          label: c.status === "Active" ? "Archive" : "Reactivate",
                          onClick: () => toggleArchive(c),
                          destructive: c.status === "Active",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No customers match those filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 0 && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalCount={pagination.totalCount}
            pageSize={PAGE_SIZE}
            onChange={pagination.setPage}
          />
        )}
      </SectionCard>

      <CustomerFormDialog customer={formCustomer} open={formOpen} onOpenChange={setFormOpen} />
      <CustomerStatementDialog
        customerId={statementId}
        customerType={all.find((c) => c.id === statementId)?.type}
        onClose={() => setStatementId(null)}
      />
    </div>
  );
}
