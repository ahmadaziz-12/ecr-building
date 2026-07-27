import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import type { Severity } from "@/lib/buildpos/format";
import {
  RowActionsMenu,
  FilterBar,
  emptyFilterDraft,
  usePagination,
  PaginationBar,
  exportToCsv,
  type FilterFieldDef,
} from "./shared";
import { RedeemPointsDialog } from "./RedeemPointsDialog";
import { AdjustPointsDialog } from "./AdjustPointsDialog";
import { CustomerStatementDialog } from "./CustomerStatementDialog";
import { LoyaltyProgramSettingsDialog } from "./LoyaltyProgramSettingsDialog";
import { useCustomers } from "@/lib/api/pos";
import { useLoyaltyTransactions, useLoyaltyProgramConfig, type LoyaltyConfigDto } from "@/lib/api/loyalty";
import { Settings2 } from "lucide-react";

const TABS = ["All", "Earn", "Redeem", "Adjust", "Reversal", "Welcome"] as const;
type Tab = (typeof TABS)[number];
// BRD §4.3.1/§4.3.3 defaults — only used before /api/loyalty/config has loaded; the page always
// prefers the live, admin-configurable rate over these once the query resolves.
const DEFAULT_CONFIG: LoyaltyConfigDto = {
  pointsPerSarEarned: 1, pointsPerSarRedeemed: 100, minRedeemPoints: 500, maxRedeemPctOfTotal: 20,
  silverThreshold: 5_000, goldThreshold: 20_000, platinumThreshold: 50_000,
  silverMultiplier: 1.5, goldMultiplier: 2, platinumMultiplier: 3,
  silverDiscountPct: 5, goldDiscountPct: 10, platinumDiscountPct: 15,
  freeDeliveryMinOrderSar: 500, birthdayBonusMultiplier: 2, pointsExpiryMonths: 12,
};
const PAGE_SIZE = 10;

function toneForType(type: string): Severity {
  switch (type) {
    case "Earn":
    case "Welcome":
    case "RedeemReversal":
      return "success";
    case "Redeem":
      return "info";
    case "Adjust":
      return "warning";
    case "Reversal":
      return "critical";
    default:
      return "muted";
  }
}
function tierTone(tier: string): Severity {
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
function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

const FIELDS: FilterFieldDef[] = [
  { kind: "date", key: "dateFrom", placeholder: "From" },
  { kind: "date", key: "dateTo", placeholder: "To" },
  { kind: "search", key: "search", placeholder: "Search customer, order #…" },
];

export function LoyaltyPage() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const { data: transactions, refetch, isFetching } = useLoyaltyTransactions();
  const { data: customers } = useCustomers(true);
  const { data: loyaltyConfig } = useLoyaltyProgramConfig();
  const config = loyaltyConfig ?? DEFAULT_CONFIG;
  const sarPerPoint = 1 / config.pointsPerSarRedeemed;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [tab, setTab] = useState<Tab>("All");
  const [draft, setDraft] = useState<Record<string, string>>(() => emptyFilterDraft(FIELDS));
  const [applied, setApplied] = useState<Record<string, string>>(draft);

  // A cross-linked page load (e.g. Customers' "View Loyalty" row action ->
  // /finance/loyalty?customerId=42) seeds the search filter with that member's name — ONCE per
  // customerId. The `customers` query refetches on window focus with a fresh identity, and without
  // the ref-guard each refetch would re-apply the seed and wipe out whatever the user filtered since.
  const seededForCustomerId = useRef<number | null>(null);
  useEffect(() => {
    const id =
      typeof search.customerId === "string" || typeof search.customerId === "number"
        ? Number(search.customerId)
        : null;
    if (!id || !customers || seededForCustomerId.current === id) return;
    const match = customers.find((c) => c.id === id);
    if (!match) return;
    seededForCustomerId.current = id;
    const seeded = { ...emptyFilterDraft(FIELDS), search: match.nameEn };
    setDraft(seeded);
    setApplied(seeded);
  }, [search.customerId, customers]);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [presetCustomerId, setPresetCustomerId] = useState<number | null>(null);
  const [statementId, setStatementId] = useState<number | null>(null);

  const all = transactions ?? [];
  const enrolledCustomers = useMemo(
    () => (customers ?? []).filter((c) => c.loyaltyEnrolled),
    [customers],
  );

  const filtered = useMemo(() => {
    return all.filter((t) => {
      if (tab !== "All" && t.type !== tab) return false;
      if (
        (applied.dateFrom || applied.dateTo) &&
        !inDateRange(t.createdAt, applied.dateFrom, applied.dateTo)
      )
        return false;
      if (applied.search) {
        const s = applied.search.trim().toLowerCase();
        if (
          s &&
          !t.customerName.toLowerCase().includes(s) &&
          !(t.orderNo ?? "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [all, tab, applied]);

  const pagination = usePagination(filtered, PAGE_SIZE, JSON.stringify(applied) + tab);

  const kpis = useMemo(() => {
    const pointsOutstanding = enrolledCustomers.reduce((s, c) => s + c.loyaltyPoints, 0);
    const now = new Date();
    const redeemedThisMonth = all.filter(
      (t) =>
        t.type === "Redeem" &&
        new Date(t.createdAt).getMonth() === now.getMonth() &&
        new Date(t.createdAt).getFullYear() === now.getFullYear(),
    );
    const topTierCount = enrolledCustomers.filter(
      (c) => c.loyaltyTier === "Gold" || c.loyaltyTier === "Platinum",
    ).length;
    return [
      {
        label: "Enrolled Members",
        value: enrolledCustomers.length,
        sub: `${customers?.length ?? 0} total customers`,
        tone: "success" as const,
      },
      {
        label: "Points Outstanding",
        value: pointsOutstanding.toLocaleString("en-US"),
        sub: `≈ ${fmtSar(pointsOutstanding * sarPerPoint)} liability`,
        tone: "info" as const,
      },
      {
        label: "Redeemed This Month",
        value: redeemedThisMonth
          .reduce((s, t) => s + Math.abs(t.points), 0)
          .toLocaleString("en-US"),
        sub: `${redeemedThisMonth.length} redemptions`,
        tone: "warning" as const,
      },
      {
        label: "Gold / Platinum Members",
        value: topTierCount,
        sub: "High-value tier",
        tone: "success" as const,
      },
    ];
  }, [enrolledCustomers, all, customers, sarPerPoint]);

  function handleExport() {
    exportToCsv(
      "loyalty-ledger.csv",
      ["Date", "Customer", "Type", "Points", "Description", "Order #"],
      filtered.map((t) => [
        fmtDate(t.createdAt),
        t.customerName,
        t.type,
        t.points,
        t.description,
        t.orderNo ?? "",
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Finance"
        title="Loyalty Program"
        desc="Points ledger, tiers and redemptions across enrolled customers — points accrue automatically at checkout and reverse automatically on approved returns."
        primary="Redeem Points"
        onPrimary={() => {
          setPresetCustomerId(null);
          setRedeemOpen(true);
        }}
        onRefresh={() => refetch()}
        onExport={handleExport}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPresetCustomerId(null);
              setAdjustOpen(true);
            }}
            className="h-9 text-muted-foreground hover:text-foreground"
          >
            Adjust Balance
          </Button>
        }
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

      <SectionCard
        title="Program Settings"
        desc="Earn/redeem rate, redemption limits and the tier ladder — applied automatically at POS checkout."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" /> Edit Settings
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Earn rate</p>
            <p className="font-display text-base font-bold text-foreground">{config.pointsPerSarEarned} pt / ر.س 1</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Redemption value</p>
            <p className="font-display text-base font-bold text-foreground">{fmtSar(sarPerPoint)} / pt</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Min to redeem</p>
            <p className="font-display text-base font-bold text-foreground">{config.minRedeemPoints.toLocaleString("en-US")} pts</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max per order</p>
            <p className="font-display text-base font-bold text-foreground">{config.maxRedeemPctOfTotal}% of total</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-black/5 pt-4 text-xs">
          <div>
            <p className="font-semibold text-info">Silver — {fmtSar(config.silverThreshold)}+</p>
            <p className="text-muted-foreground">{config.silverMultiplier}x points · {config.silverDiscountPct}% off</p>
          </div>
          <div>
            <p className="font-semibold text-warning">Gold — {fmtSar(config.goldThreshold)}+</p>
            <p className="text-muted-foreground">{config.goldMultiplier}x points · {config.goldDiscountPct}% off</p>
          </div>
          <div>
            <p className="font-semibold text-success">Platinum — {fmtSar(config.platinumThreshold)}+</p>
            <p className="text-muted-foreground">{config.platinumMultiplier}x points · {config.platinumDiscountPct}% off</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Members" desc={`${enrolledCustomers.length} enrolled`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Lifetime</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrolledCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.nameEn}</TableCell>
                  <TableCell>
                    <Pill tone={tierTone(c.loyaltyTier)}>{c.loyaltyTier}</Pill>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {c.loyaltyPoints.toLocaleString("en-US")} pts
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.loyaltyLifetimePoints.toLocaleString("en-US")} pts
                  </TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        {
                          label: "Redeem Points",
                          onClick: () => {
                            setPresetCustomerId(c.id);
                            setRedeemOpen(true);
                          },
                          disabled: c.loyaltyPoints <= 0,
                        },
                        {
                          label: "Adjust Balance",
                          onClick: () => {
                            setPresetCustomerId(c.id);
                            setAdjustOpen(true);
                          },
                        },
                        "separator",
                        { label: "View Statement", onClick: () => setStatementId(c.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {enrolledCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No customers are enrolled in the loyalty program yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Points Ledger" desc={`${filtered.length} records`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageRows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(t.createdAt)}
                  </TableCell>
                  <TableCell>{t.customerName}</TableCell>
                  <TableCell>
                    <Pill tone={toneForType(t.type)}>{t.type}</Pill>
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono font-medium ${t.points < 0 ? "text-critical" : "text-success"}`}
                  >
                    {t.points > 0 ? `+${t.points}` : t.points}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {t.description}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.orderNo ?? "—"}</TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        {
                          label: "View Customer Statement",
                          onClick: () => setStatementId(t.customerId),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No loyalty activity matches those filters.
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

      <RedeemPointsDialog
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        customers={enrolledCustomers}
        initialCustomerId={presetCustomerId}
      />
      <AdjustPointsDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        customers={enrolledCustomers}
        initialCustomerId={presetCustomerId}
      />
      <CustomerStatementDialog customerId={statementId} onClose={() => setStatementId(null)} />
      <LoyaltyProgramSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} config={config} />
    </div>
  );
}
