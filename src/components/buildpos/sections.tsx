import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronRight,
  ChevronDown,
  Download,
  Filter,
  Bookmark,
  X,
  FileText,
  Hammer,
  History,
  Layers,
  LayoutGrid,
  Monitor,
  Package,
  PaintBucket,
  Plus,
  Power,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShoppingCart,
  Square,
  Truck,
  TrendingUp,
  Users,
  Wrench,
  Zap,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MultiSelectFilter, DateRangeFilter } from "@/components/buildpos/FilterControls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSAR, type Severity } from "@/lib/buildpos/format";
import {
  alerts,
  branches,
  cashierKpis,
  cashierWorkspaceSummary,
  contractorOrders,
  deliveries,
  deliveryDetail,
  deliveryChips,
  dispatchPipeline,
  groupedAlerts,
  hourlySales,
  inventoryKpis,
  inventorySummary,
  kpis,
  lowStock,
  overviewKpis,
  paymentBreakdown,
  payments,
  quickActions,
  recentOrders,
  returnBreakdown,
  returns as returnsData,
  returnsSummary,
  salesPerfKpis,
  shifts,
  stockYard,
  terminalDetail,
  terminals,
  topCategories,
  zatcaInvoices,
} from "@/lib/buildpos/data";
import {
  allLabels,
  categoryToFilter,
  moreFilterGroups,
  primaryFilterGroups,
  useFilters,
} from "@/lib/buildpos/filter-context";
import { useAuth } from "@/lib/api/auth";
import { useCategories } from "@/lib/api/catalog";
import { useBranches, useTerminals } from "@/lib/api/admin";
import { useOrders } from "@/lib/api/pos";
import cementImg from "@/assets/cat-cement.jpg";
import steelImg from "@/assets/cat-steel.jpg";
import tilesImg from "@/assets/cat-tiles.jpg";
import paintImg from "@/assets/cat-paint.jpg";
import constructionHero from "@/assets/construction-hero.jpg";

const categoryImage: Record<string, string> = {
  "Cement & Aggregates": cementImg,
  "Steel & Rebar": steelImg,
  "Tiles & Flooring": tilesImg,
  "Paint & Chemicals": paintImg,
};

/* ---------------- tone system ---------------- */

const tonePill: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical border-critical/20",
  warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
  success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
  info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
  muted: "bg-black/5 text-foreground/70 border-black/10",
};

const toneIcon: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical",
  warning: "bg-warning/20 text-[oklch(0.4_0.13_70)]",
  success: "bg-success/15 text-[oklch(0.35_0.1_155)]",
  info: "bg-info/10 text-[oklch(0.35_0.12_235)]",
  muted: "bg-black/5 text-foreground/70",
};

function toneForStatus(s: string): Severity {
  const k = s.toLowerCase();
  if (["critical", "failed", "offline"].some((x) => k.includes(x))) return "critical";
  if (["low", "warning", "pending", "queued", "idle", "needs", "quarantine"].some((x) => k.includes(x)))
    return "warning";
  // Negated words checked before the success list substring-matches inside them ("Inactive" contains "active").
  if (["inactive", "in-active", "disabled", "deactivated", "suspended"].some((x) => k.includes(x))) return "muted";
  if (["active", "cleared", "delivered", "completed", "reconciled", "healthy", "submitted"].some((x) =>
    k.includes(x)
  ))
    return "success";
  if (["assigned", "dispatched", "posted", "open", "normal"].some((x) => k.includes(x))) return "info";
  return "muted";
}

export function Pill({ tone, children }: { tone: Severity; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tonePill[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  desc,
  action,
  children,
  className = "",
}: {
  title?: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] md:p-5 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>}
            {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  trending: TrendingUp, receipt: Receipt, cart: ShoppingCart, shield: Shield,
  package: Package, truck: Truck, users: Users, alert: AlertTriangle,
  layers: Layers, bar: BarChart3, grid: LayoutGrid, paint: PaintBucket,
  pipe: Wrench, zap: Zap, hammer: Hammer, square: Square,
  plus: Plus, history: History, file: FileText, search: Search,
  chart: BarChart3, refresh: RefreshCw, power: Power, monitor: Monitor,
};

/* ---------------- Filter Bar ---------------- */

// Filters actually consumed by live dashboard data (Category → InventoryHealth,
// Branch/Terminal/Cashier/Status/Date Range → order-derived KPIs in dashboard.tsx). Everything
// else (the "More Filters" panel) is display-only — those don't map onto any single dataset the
// dashboard renders.
const LIVE_FILTER_LABELS = ["Branch", "Category", "Terminal", "Cashier", "Status", "Date Range"];

export function FilterBar({ compact = false }: { compact?: boolean }) {
  const { values, setValue, dateRange, setDateRange, reset } = useFilters();
  const queryClient = useQueryClient();
  const { hasAccess } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  // The static blueprint option names ("Cement & Binders", "Riyadh Main Branch") don't match the
  // live category/branch/terminal/cashier names, so wired consumers would filter everything to
  // nothing — swap in the real names once loaded.
  const { data: liveCategories } = useCategories(hasAccess("Inventory"));
  const { data: liveBranches } = useBranches(hasAccess("Network"));
  const { data: liveTerminals } = useTerminals(hasAccess("Network"));
  const { data: liveOrders } = useOrders(hasAccess("Orders"));
  const liveCashiers = [...new Set((liveOrders ?? []).map((o) => o.cashierName).filter(Boolean))].sort();
  const liveOptions = (g: { label: string; options: string[] }): string[] => {
    if (g.label === "Category" && liveCategories?.length) return liveCategories.map((c) => c.nameEn);
    if (g.label === "Branch" && liveBranches?.length) return liveBranches.map((b) => b.nameEn);
    if (g.label === "Terminal" && liveTerminals?.length) return liveTerminals.map((t) => t.code);
    if (g.label === "Cashier" && liveCashiers.length) return liveCashiers;
    return g.options;
  };
  const shown = compact ? primaryFilterGroups.slice(0, 4) : primaryFilterGroups;
  const allGroups = [...primaryFilterGroups, ...moreFilterGroups];
  const activeChips: { label: string; value: string }[] = [
    ...(dateRange.preset ? [{ label: "Date Range", value: dateRange.preset === "Custom Range" && dateRange.from && dateRange.to ? `${dateRange.from} – ${dateRange.to}` : dateRange.preset }] : []),
    ...allGroups
      .filter((g) => (values[g.label] ?? []).length > 0)
      .map((g) => ({ label: g.label, value: values[g.label].length === 1 ? values[g.label][0] : `${values[g.label].length} selected` })),
  ];

  return (
    <div className="rounded-2xl border border-brand/15 bg-gradient-to-r from-brand/5 via-white to-teal/5 p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand">
            <Filter className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Filters</h3>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Branch, Category, Terminal, Cashier, Status & Date Range filter the live data · advanced filters are demo-only</span>
          {activeChips.length > 0 && (
            <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.4_0.13_70)]">
              {activeChips.length} active
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-brand"
            onClick={() => {
              reset();
              toast.success("Filters reset", { description: "Showing default view." });
            }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-brand"
            onClick={() => toast.info("Saved views aren't wired on the dashboard yet.")}
          >
            <Bookmark className="h-3.5 w-3.5" /> Save View
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-brand"
            onClick={() => {
              queryClient.invalidateQueries();
              toast.success("Refreshed", { description: "Live queries refetching." });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-brand"
            onClick={() => toast.info("Export isn't wired on the dashboard yet.")}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button
            size="sm"
            className="h-8 bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => {
              // Filters apply live as they change — this button only reports what's active, and
              // never claims controls that aren't wired to live data were "applied".
              const wired = activeChips.filter((c) => LIVE_FILTER_LABELS.includes(c.label));
              const unwired = activeChips.filter((c) => !LIVE_FILTER_LABELS.includes(c.label));
              if (unwired.length > 0) {
                toast.warning(`Not wired to live data yet: ${unwired.map((c) => c.label).join(", ")}`, {
                  description: wired.length
                    ? `Applied — ${wired.map((c) => `${c.label}: ${c.value}`).join(" · ")}`
                    : "Only Branch, Category, Terminal, Cashier, Status & Date Range filter the live data.",
                });
              } else {
                toast.success(wired.length ? "Filters applied" : "Default view", {
                  description: wired.length
                    ? wired.map((c) => `${c.label}: ${c.value}`).join(" · ")
                    : "Filters apply as you change them.",
                });
              }
            }}
          >
            Apply Filters
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {shown.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <label className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</label>
            <MultiSelectFilter
              label={g.label}
              allLabel={allLabels[g.label] ?? `All ${g.label}`}
              options={liveOptions(g)}
              selected={values[g.label] ?? []}
              onChange={(next) => setValue(g.label, next)}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Date Range</label>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 border-dashed text-xs">
              <Plus className="h-3.5 w-3.5" /> More Filters
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="end">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Advanced filters</p>
            <div className="grid grid-cols-1 gap-2">
              {moreFilterGroups.map((g) => (
                <div key={g.label} className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-medium text-foreground/80">{g.label}</label>
                  <MultiSelectFilter
                    label={g.label}
                    allLabel={allLabels[g.label] ?? `All ${g.label}`}
                    options={g.options}
                    selected={values[g.label] ?? []}
                    onChange={(next) => setValue(g.label, next)}
                    triggerClassName="w-40"
                  />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeChips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => (c.label === "Date Range" ? setDateRange({ preset: "" }) : setValue(c.label, []))}
              className="bp-fade group inline-flex items-center gap-1 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand transition hover:bg-brand/15"
            >
              <span className="text-brand/70">{c.label}:</span> {c.value}
              <X className="h-3 w-3 opacity-60 transition group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- KPI Grid ---------------- */

export function KpiGrid({ items = kpis }: { items?: typeof kpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((k) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <div
            key={k.key}
            className="group flex cursor-pointer flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:border-brand/30 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k.title}
                </p>
                <p className="mt-1.5 font-display text-2xl font-bold text-foreground">{k.value}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneIcon[k.tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Pill tone={k.tone}>{k.sub}</Pill>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Quick Actions ---------------- */

export function QuickActions() {
  return (
    <SectionCard title="Quick Actions" desc="Cashier and manager shortcuts.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {quickActions.map((a) => {
          const Icon = iconMap[a.icon] ?? Plus;
          return (
            <button
              key={a.label}
              onClick={() => toast.info(a.label, { description: "Action triggered." })}
              className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-black/5 bg-canvas p-3 text-center text-xs font-medium text-foreground transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-brand-foreground">
                <Icon className="h-4 w-4" />
              </span>
              {a.label}
              {a.badge != null && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-teal px-1.5 text-[10px] font-bold text-teal-foreground">
                  {a.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ---------------- Sales Performance ---------------- */

const BRAND = "oklch(0.48 0.19 285)";
const TEAL = "oklch(0.65 0.12 185)";
const RED = "oklch(0.62 0.24 25)";

export function SalesPerformance({ data = hourlySales }: { data?: typeof hourlySales }) {
  return (
    <SectionCard
      title="Sales Performance"
      desc="Hourly gross vs net sales and returns."
      action={<Pill tone="success">Live</Pill>}
    >
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="g-gross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,10,50,0.06)" />
            <XAxis dataKey="time" stroke="rgba(15,10,50,0.5)" fontSize={11} />
            <YAxis stroke="rgba(15,10,50,0.5)" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "white", border: "1px solid rgba(15,10,50,0.1)", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="gross" stroke={BRAND} strokeWidth={2} fill="url(#g-gross)" name="Gross" />
            <Area type="monotone" dataKey="net" stroke={TEAL} strokeWidth={2} fill="url(#g-net)" name="Net" />
            <Line type="monotone" dataKey="returns" stroke={RED} strokeWidth={2} name="Returns" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

/* ---------------- Payment Collection ---------------- */

const PIE_COLORS = [BRAND, TEAL, "oklch(0.7 0.15 300)", "oklch(0.7 0.13 220)", "oklch(0.75 0.14 60)", "oklch(0.65 0.15 340)"];

export function PaymentCollection() {
  const total = payments.reduce((s, p) => s + p.amount, 0);
  return (
    <SectionCard title="Payment Collection" desc={`Today · ${formatSAR(total)} collected`}>
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-5">
        <div className="h-52 md:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={payments} dataKey="amount" nameKey="method" innerRadius={45} outerRadius={80} stroke="white" strokeWidth={2}>
                {payments.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "white", border: "1px solid rgba(15,10,50,0.1)", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5 md:col-span-3">
          {payments.map((p, i) => (
            <div key={p.method} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-canvas">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="font-medium text-foreground">{p.method}</span>
                <span className="text-muted-foreground">· {p.tx} tx</span>
              </span>
              <span className="font-semibold text-foreground">{formatSAR(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------------- Top Categories ---------------- */

export function TopCategories() {
  const { values, setValue, setActiveTab } = useFilters();
  const active = values.Category ?? [];
  return (
    <SectionCard
      title="Top Material Categories"
      desc="Click a category to filter inventory, stock alerts & tables."
      action={
        active.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-brand hover:bg-brand/5 hover:text-brand"
            onClick={() => {
              setValue("Category", []);
              toast.info("Category filter cleared");
            }}
          >
            Clear · {active.join(", ")}
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {topCategories.map((c) => {
          const Icon = iconMap[c.icon] ?? Boxes;
          const tone = toneForStatus(c.health);
          const img = categoryImage[c.name];
          const catValue = categoryToFilter(c.name);
          const isActive = !!catValue && active.includes(catValue);
          return (
            <button
              type="button"
              key={c.name}
              onClick={() => {
                setValue("Category", catValue ? [catValue] : []);
                setActiveTab("inventory");
                toast.success(catValue ? `Filtered by ${catValue}` : "Showing all categories", {
                  description: "Inventory & stock alerts updated.",
                });
              }}
              className={`group overflow-hidden rounded-xl border bg-canvas text-left transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                isActive ? "border-brand ring-2 ring-brand/30 bg-white shadow-md" : "border-black/5"
              }`}
            >
              {img ? (
                <div className="relative h-24 w-full overflow-hidden bg-black/5">
                  <img
                    src={img}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                  <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-brand backdrop-blur">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="absolute right-2 top-2"><Pill tone={tone}>{c.health}</Pill></span>
                  {isActive && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
                      Active filter
                    </span>
                  )}
                </div>
              ) : (
                <div className="relative h-24 w-full overflow-hidden bg-gradient-to-br from-brand/10 via-white to-teal/10">
                  <div className="absolute inset-0 blueprint-grid opacity-60" />
                  <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-brand">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="absolute right-2 top-2"><Pill tone={tone}>{c.health}</Pill></span>
                  {isActive && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
                      Active filter
                    </span>
                  )}
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">{formatSAR(c.sales)}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{c.units}</span>
                  <span>Returns {c.ret}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ---------------- Inventory Health ---------------- */

export function InventoryHealth({
  rows: allRows = lowStock,
  summary = inventorySummary,
}: {
  rows?: typeof lowStock;
  summary?: typeof inventorySummary;
}) {
  const { values, setValue } = useFilters();
  const navigate = useNavigate();
  const cat = values.Category ?? [];
  const rows = cat.length === 0 ? allRows : allRows.filter((r) => cat.some((c) => r.cat.toLowerCase() === c.toLowerCase()));
  return (
    <SectionCard
      title="Stock Health & Availability"
      desc={cat.length === 0 ? "Availability across branches and warehouses." : `Filtered by category · ${cat.join(", ")} (${rows.length} SKUs)`}
      action={
        <div className="flex items-center gap-2">
          {cat.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-brand"
              onClick={() => setValue("Category", [])}
            >
              Clear filter
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-brand hover:bg-brand/5 hover:text-brand"
            onClick={() => navigate({ to: "/stock/stocks", search: { status: "Low" } })}
          >
            Low Stock Report <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {summary.map((s) => (
          <div key={s.label} className="rounded-lg border border-black/5 bg-canvas p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["SKU", "Product", "Category", "Branch", "Available", "Reorder", "Supplier", "Status"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No SKUs in stock alerts for <span className="font-semibold text-foreground">{cat}</span>.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
              <TableRow key={`${r.sku}-${r.branch}`} className="bp-enter hover:bg-canvas">
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.cat}</TableCell>
                <TableCell>{r.branch}</TableCell>
                <TableCell>{r.qty}</TableCell>
                <TableCell className="text-muted-foreground">{r.reorder}</TableCell>
                <TableCell className="text-muted-foreground">{r.supplier}</TableCell>
                <TableCell><Pill tone={toneForStatus(String(r.status))}>{String(r.status)}</Pill></TableCell>
              </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- Cashier Activity ---------------- */

export function CashierActivity() {
  return (
    <>
      <SectionCard title="Terminal Activity" desc="Live shifts, transactions, and sync status.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Terminal", "Cashier", "Shift Start", "Tx", "Sales", "Expected Cash", "Last Sync", "Status"].map((h) => (
                  <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {terminals.map((t) => (
                <TableRow key={t.term} className="hover:bg-canvas">
                  <TableCell className="font-mono text-xs">{t.term}</TableCell>
                  <TableCell className="font-medium">{t.cashier}</TableCell>
                  <TableCell>{t.start}</TableCell>
                  <TableCell>{t.tx}</TableCell>
                  <TableCell className="font-semibold">{t.sales}</TableCell>
                  <TableCell className="text-muted-foreground">{t.cash}</TableCell>
                  <TableCell className="text-muted-foreground">{t.sync}</TableCell>
                  <TableCell><Pill tone={toneForStatus(String(t.status))}>{String(t.status)}</Pill></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Shift Summary" desc="Cash reconciliation and variance across active shifts.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Shift", "Cashier", "Opening", "Cash Sales", "Expected", "Counted", "Variance", "Status"].map((h) => (
                  <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id} className="hover:bg-canvas">
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell className="font-medium">{s.cashier}</TableCell>
                  <TableCell>{formatSAR(s.opening)}</TableCell>
                  <TableCell>{formatSAR(s.cash)}</TableCell>
                  <TableCell>{formatSAR(s.expected)}</TableCell>
                  <TableCell>{formatSAR(s.counted)}</TableCell>
                  <TableCell className={s.variance < 0 ? "font-semibold text-critical" : "text-muted-foreground"}>
                    {s.variance === 0 ? "0 ر.س" : formatSAR(s.variance)}
                  </TableCell>
                  <TableCell><Pill tone={toneForStatus(s.status)}>{s.status}</Pill></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

/* ---------------- Delivery Queue ---------------- */

export function DeliveryQueue() {
  return (
    <SectionCard title="Delivery & Dispatch Queue" desc="Contractor orders and bulky-material dispatch.">
      <div className="mb-4 flex flex-wrap gap-2">
        {deliveryChips.map((c) => (
          <Pill key={c.label} tone={c.tone}>
            {c.label}: <span className="ml-1 font-bold">{c.value}</span>
          </Pill>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Delivery No.", "Customer", "Area", "Items", "Time", "Driver", "Status", "Amount"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => (
              <TableRow key={d.no} className="hover:bg-canvas">
                <TableCell className="font-mono text-xs">{d.no}</TableCell>
                <TableCell className="font-medium">{d.customer}</TableCell>
                <TableCell>{d.area}</TableCell>
                <TableCell className="text-muted-foreground">{d.items}</TableCell>
                <TableCell>{d.time}</TableCell>
                <TableCell className="text-muted-foreground">{d.driver}</TableCell>
                <TableCell><Pill tone={toneForStatus(String(d.status))}>{String(d.status)}</Pill></TableCell>
                <TableCell className="font-semibold">{d.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- Operational Alerts ---------------- */

export function OperationalAlerts() {
  return (
    <SectionCard title="Critical Alerts" desc="Requires supervisor or store manager action.">
      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-black/5 bg-canvas p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <div className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${toneIcon[a.severity]}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Pill tone={a.severity}>{a.module}</Pill>
                  <span className="text-[11px] text-muted-foreground">{a.age} ago</span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">{a.msg}</p>
                <p className="text-[11px] text-muted-foreground">Assigned to {a.owner}</p>
              </div>
            </div>
            <div className="flex gap-2 pl-12 sm:pl-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => toast.success("Acknowledged", { description: a.msg })}
              >
                Acknowledge
              </Button>
              <Button
                size="sm"
                className="h-8 bg-brand text-brand-foreground text-xs hover:bg-brand/90"
                onClick={() => toast.success(a.action, { description: `${a.module}: ${a.msg}` })}
              >
                {a.action}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------------- Returns & Refunds ---------------- */

export function ReturnsRefunds() {
  return (
    <SectionCard title="Returns & Refunds" desc="Standard, damaged, and surplus returns with VAT reversal.">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {returnsSummary.map((s) => (
          <div key={s.label} className="rounded-lg border border-black/5 bg-canvas p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Return", "Invoice", "Customer", "Type", "Product", "Refund", "Reason", "Status", "Approved By"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {returnsData.map((r) => (
              <TableRow key={r.id} className="hover:bg-canvas">
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="font-mono text-xs">{r.inv}</TableCell>
                <TableCell className="font-medium">{r.customer}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>{r.product}</TableCell>
                <TableCell className="font-semibold">{r.amount}</TableCell>
                <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                <TableCell><Pill tone={toneForStatus(String(r.status))}>{String(r.status)}</Pill></TableCell>
                <TableCell className="text-muted-foreground">{r.by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- Branch Performance ---------------- */

export function BranchPerformance({ rows = branches }: { rows?: typeof branches }) {
  return (
    <SectionCard title="Branch Performance" desc="Snapshot across all Mi Money branches.">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Branch", "Sales", "Tx", "Returns", "Avg Basket", "Low Stock", "Open Shifts", "Status"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.branch} className="hover:bg-canvas">
                <TableCell className="font-medium">{b.branch}</TableCell>
                <TableCell className="font-semibold">{b.sales}</TableCell>
                <TableCell>{b.tx}</TableCell>
                <TableCell className="text-muted-foreground">{b.returns}</TableCell>
                <TableCell>{b.basket}</TableCell>
                <TableCell>{b.low}</TableCell>
                <TableCell>{b.shifts}</TableCell>
                <TableCell><Pill tone="success">Active</Pill></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- ZATCA Compliance ---------------- */

export function ZatcaCompliance() {
  return (
    <SectionCard title="ZATCA & Compliance" desc="Invoice clearance and submission status.">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Invoice", "Order", "Type", "Amount", "VAT", "Status", "Error", "Action"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {zatcaInvoices.map((z) => (
              <TableRow key={z.no} className="hover:bg-canvas">
                <TableCell className="font-mono text-xs">{z.no}</TableCell>
                <TableCell className="font-mono text-xs">{z.order}</TableCell>
                <TableCell>{z.type}</TableCell>
                <TableCell>{z.amount}</TableCell>
                <TableCell>{z.vat}</TableCell>
                <TableCell><Pill tone={toneForStatus(String(z.status))}>{String(z.status)}</Pill></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{z.err}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-brand hover:bg-brand/5 hover:text-brand"
                    onClick={() => toast.success(`${z.action}: ${z.no}`, { description: `Order ${z.order}` })}
                  >
                    {z.action}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- Industrial Command KPIs ---------------- */

export function CommandKpis() {
  const cementSteel =
    (topCategories.find((c) => /cement/i.test(c.name))?.sales ?? 0) +
    (topCategories.find((c) => /steel/i.test(c.name))?.sales ?? 0);
  const contractorValue = contractorOrders.reduce(
    (s, o) => s + Number(String(o.value).replace(/[^0-9.-]/g, "")),
    0
  );
  const warehouseValue = inventorySummary.find((s) => /value/i.test(s.label))?.value ?? "—";

  const tiles = [
    { label: "Today's Material Sales", value: kpis.find((k) => k.key === "sales")?.value ?? "0", hint: "Live from POS", icon: TrendingUp, tone: "brand" },
    { label: "Contractor Orders", value: `${contractorOrders.length} Orders`, hint: `${formatSAR(contractorValue)} B2B pipeline`, icon: Users, tone: "info" },
    { label: "Cement & Steel Sales", value: formatSAR(cementSteel), hint: "Bulk material lane", icon: Layers, tone: "brand" },
    { label: "Pending Deliveries", value: `${deliveryChips.find((c) => /pending/i.test(c.label))?.value ?? 0} DOs`, hint: "Awaiting dispatch", icon: Truck, tone: "warning" },
    { label: "Low Stock Materials", value: inventorySummary.find((s) => /low/i.test(s.label))?.value ?? "—", hint: "Reorder queue", icon: Package, tone: "warning" },
    { label: "Warehouse Stock Value", value: warehouseValue, hint: "Across 5 KSA branches", icon: Boxes, tone: "success" },
    { label: "Open Cashier Shifts", value: `${terminals.filter((t) => String(t.status).toLowerCase().includes("active")).length} Active`, hint: `${terminals.length} terminals total`, icon: Users, tone: "info" },
    { label: "Failed ZATCA / Sync", value: `${zatcaInvoices.filter((z) => /fail|queued/i.test(String(z.status))).length} Alerts`, hint: "Needs retry", icon: Shield, tone: "critical" },
  ] as const;

  const toneMap: Record<string, string> = {
    brand: "border-brand/25 from-brand/10",
    info: "border-info/25 from-info/10",
    warning: "border-warning/40 from-warning/15",
    success: "border-success/30 from-success/10",
    critical: "border-critical/30 from-critical/10",
  };
  const iconTone: Record<string, string> = {
    brand: "bg-brand text-brand-foreground",
    info: "bg-info/20 text-[oklch(0.35_0.12_235)]",
    warning: "bg-warning/25 text-[oklch(0.4_0.13_70)]",
    success: "bg-success/20 text-[oklch(0.35_0.1_155)]",
    critical: "bg-critical text-critical-foreground bp-pulse-dot",
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t, i) => {
        const Icon = t.icon;
        const pct = Math.min(100, 25 + i * 9);
        return (
          <div
            key={t.label}
            className={`bp-enter stagger-${(i % 6) + 1} group relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br ${toneMap[t.tone]} to-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:shadow-lg`}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 hazard-stripe opacity-70" />
            <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-25" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t.label}
                </p>
                <p className="mt-1.5 font-display text-[22px] font-bold leading-none text-foreground">
                  {t.value}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t.hint}</p>
              </div>
              <div className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${iconTone[t.tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-teal transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Contractor & B2B Orders ---------------- */

export function ContractorOrders() {
  return (
    <SectionCard
      title="Contractor & B2B Orders"
      desc="Project-linked orders with PO reference, credit and delivery requirement."
      action={<Pill tone="info">B2B pipeline</Pill>}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Order", "Contractor", "Project", "PO Ref", "Credit", "Value", "Delivery", "Invoice", "Payment", "Status"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contractorOrders.map((o) => (
              <TableRow key={o.id} className="bp-enter hover:bg-canvas">
                <TableCell className="font-mono text-xs">{o.id}</TableCell>
                <TableCell className="font-medium">{o.customer}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{o.project}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{o.po}</TableCell>
                <TableCell><Pill tone={o.credit === "Approved" ? "success" : "warning"}>{o.credit}</Pill></TableCell>
                <TableCell className="font-semibold">{o.value}</TableCell>
                <TableCell className="text-muted-foreground">{o.delivery}</TableCell>
                <TableCell className="text-muted-foreground">{o.invoice}</TableCell>
                <TableCell className="text-muted-foreground">{o.pay}</TableCell>
                <TableCell><Pill tone={toneForStatus(String(o.status))}>{String(o.status)}</Pill></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ---------------- Dispatch Board (visual kanban) ---------------- */

export function DispatchBoard() {
  const lanes: { key: string; title: string; tone: Severity }[] = [
    { key: "Pending", title: "Pending", tone: "warning" },
    { key: "Assigned", title: "Assigned", tone: "info" },
    { key: "Dispatched", title: "Dispatched", tone: "info" },
    { key: "Delivered", title: "Delivered", tone: "success" },
    { key: "Failed", title: "Failed / Returned", tone: "critical" },
  ];
  return (
    <SectionCard
      title="Dispatch Yard Board"
      desc="Loading bay, drivers and delivery orders grouped by status."
      action={
        <div className="flex flex-wrap gap-1.5">
          {deliveryChips.map((c) => (
            <Pill key={c.label} tone={c.tone}>
              {c.label} · <span className="font-bold">{c.value}</span>
            </Pill>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {lanes.map((lane) => {
          const cards = deliveries.filter((d) => String(d.status).toLowerCase() === lane.key.toLowerCase());
          return (
            <div key={lane.key} className="rounded-xl border border-black/5 concrete-panel p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                  <Truck className="h-3.5 w-3.5" /> {lane.title}
                </span>
                <Pill tone={lane.tone}>{cards.length}</Pill>
              </div>
              <div className="space-y-2">
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed border-black/10 bg-white/60 p-3 text-center text-[11px] text-muted-foreground">
                    Empty lane
                  </div>
                )}
                {cards.map((d) => (
                  <div
                    key={d.no}
                    className="bp-enter group cursor-pointer rounded-lg border border-black/5 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow"
                    onClick={() => toast.info(`${d.no} · ${d.customer}`, { description: `${d.items} · ${d.driver}` })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold text-brand">{d.no}</span>
                      <span className="text-[10px] text-muted-foreground">{d.time}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-foreground">{d.customer}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{d.items} · {d.area}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">🚚 {d.driver}</span>
                      <span className="font-semibold text-foreground">{d.amount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ---------------- Stock Yard Health (bin visual) ---------------- */

export function StockYardHealth() {
  const barTone: Record<Severity, string> = {
    critical: "bg-critical",
    warning: "bg-warning",
    success: "bg-success",
    info: "bg-info",
    muted: "bg-foreground/30",
  };
  return (
    <SectionCard
      title="Warehouse & Bin Occupancy"
      desc="Yard capacity across bays. Red bins need urgent replenishment."
      action={<Pill tone="info">8 bays live</Pill>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stockYard.map((b, i) => {
          const pct = Math.round((b.filled / b.capacity) * 100);
          return (
            <div
              key={b.bin}
              className={`bp-enter stagger-${(i % 6) + 1} group relative overflow-hidden rounded-xl border border-black/5 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-30" />
              <div className="relative flex items-center justify-between">
                <span className="rounded-md bg-steel px-1.5 py-0.5 font-mono text-[10px] font-bold text-steel-foreground">
                  BIN {b.bin}
                </span>
                <Pill tone={b.tone}>{pct}%</Pill>
              </div>
              <p className="relative mt-2 text-sm font-semibold text-foreground">{b.label}</p>
              <p className="relative text-[11px] text-muted-foreground">{b.branch}</p>
              <div className="relative mt-3 flex items-end gap-0.5 h-10">
                {Array.from({ length: 10 }).map((_, k) => {
                  const on = k < Math.round(pct / 10);
                  return (
                    <div
                      key={k}
                      className={`flex-1 rounded-sm transition-all ${on ? barTone[b.tone] : "bg-black/5"}`}
                      style={{ height: `${30 + k * 7}%` }}
                    />
                  );
                })}
              </div>
              <div className="relative mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Filled {b.filled}</span>
                <span>Cap {b.capacity}</span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ---------------- Alerts Rail (right-side compact) ---------------- */

export function AlertsRail() {
  const grouped: Record<Severity, typeof alerts> = { critical: [], warning: [], info: [], success: [], muted: [] };
  alerts.forEach((a) => grouped[a.severity].push(a));
  const order: Severity[] = ["critical", "warning", "info"];
  return (
    <SectionCard
      title="Control Panel — Alerts"
      desc="Grouped by severity. Act from here."
      action={<Pill tone="critical">{grouped.critical.length} critical</Pill>}
      className="sticky top-32"
    >
      <div className="space-y-3">
        {order.map((sev) =>
          grouped[sev].length === 0 ? null : (
            <div key={sev}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${sev === "critical" ? "bg-critical bp-pulse-dot" : sev === "warning" ? "bg-warning" : "bg-info"}`} />
                {sev} · {grouped[sev].length}
              </div>
              <div className="space-y-1.5">
                {grouped[sev].map((a, i) => (
                  <div key={i} className="rounded-lg border border-black/5 bg-canvas p-2.5 transition hover:bg-white hover:shadow-sm">
                    <div className="flex items-center justify-between">
                      <Pill tone={a.severity}>{a.module}</Pill>
                      <span className="text-[10px] text-muted-foreground">{a.age}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-snug text-foreground">{a.msg}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">→ {a.owner}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-brand hover:bg-brand/10 hover:text-brand"
                        onClick={() => toast.success(a.action, { description: a.msg })}
                      >
                        {a.action}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </SectionCard>
  );
}
/* ================================================================
 * SPEC 7 · DASHBOARD SECTIONS (Building Materials Blueprint)
 * ================================================================ */

/* ---------- Page header (spec 7.1 title + subtitle) ---------- */

export function DashboardHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="bp-fade relative overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-[oklch(0.22_0.08_285)] via-[oklch(0.18_0.06_285)] to-[oklch(0.12_0.05_285)] px-5 py-6 text-white shadow-[0_10px_40px_-12px_rgba(76,29,149,0.35)]">
      <img
        src={constructionHero}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity"
      />
      <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-40" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand/30 blur-3xl bp-float-slow" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-teal/20 blur-3xl bp-float" />
      <div className="relative flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-glow">
          BuildPOS · Command Center
        </p>
        <h1 className="font-display text-2xl font-bold leading-tight md:text-[28px]">
          Building Materials Operations
        </h1>
        <p className="max-w-2xl text-[13px] text-white/70">{subtitle}</p>
      </div>
    </header>
  );
}

/* ---------- 7.1a Overview KPI cards (6) ---------- */

export function OverviewKpis({ items = overviewKpis }: { items?: typeof overviewKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((k, i) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <div
            key={k.key}
            className={`bp-enter stagger-${(i % 6) + 1} group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md`}
          >
            <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-25" />
            <div className="relative flex items-start justify-between">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${toneIcon[k.tone]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <Pill tone={k.tone}>{k.sub.split(" ")[0]}</Pill>
            </div>
            <p className="relative mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {k.title}
            </p>
            <p className="relative mt-0.5 font-display text-[22px] font-bold tabular-nums leading-tight text-foreground">
              {k.value}
            </p>
            <p className="relative mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 7.1b Today's Sales Summary — compact hourly ---------- */

export function HourlySummary({ data = hourlySales, tx = 286 }: { data?: typeof hourlySales; tx?: number }) {
  const gross = data.reduce((s, h) => s + h.gross, 0);
  const net = data.reduce((s, h) => s + h.net, 0);
  const basket = tx === 0 ? 0 : Math.round(net / tx);
  return (
    <SectionCard
      title="Today's Sales Summary"
      desc="Hourly gross vs net across the trading day."
      action={<Pill tone="success">Live · auto-refresh 60s</Pill>}
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "Gross sales", v: formatSAR(gross) },
          { l: "Net sales", v: formatSAR(net) },
          { l: "Transactions", v: tx.toString() },
          { l: "Avg basket", v: formatSAR(basket) },
        ].map((c) => (
          <div key={c.l} className="rounded-lg border border-black/5 bg-canvas p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.l}</p>
            <p className="mt-1 font-display text-base font-bold tabular-nums text-foreground">{c.v}</p>
          </div>
        ))}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="g-hs-gross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-hs-net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.3} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,10,50,0.06)" />
            <XAxis dataKey="time" stroke="rgba(15,10,50,0.5)" fontSize={11} />
            <YAxis stroke="rgba(15,10,50,0.5)" fontSize={11} />
            <Tooltip contentStyle={{ background: "white", border: "1px solid rgba(15,10,50,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="gross" stroke={BRAND} strokeWidth={2} fill="url(#g-hs-gross)" name="Gross" />
            <Area type="monotone" dataKey="net" stroke={TEAL} strokeWidth={2} fill="url(#g-hs-net)" name="Net" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

/* ---------- 7.1c Dispatch Pipeline Preview (horizontal) ---------- */

export function DispatchPipelinePreview({
  onViewAll,
  stages = dispatchPipeline,
  previewCards = deliveryDetail.slice(0, 3),
}: {
  onViewAll?: () => void;
  stages?: typeof dispatchPipeline;
  previewCards?: typeof deliveryDetail;
}) {
  return (
    <SectionCard
      title="Dispatch Pipeline"
      desc="Live delivery-order stages across the yard."
      action={
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs text-brand hover:bg-brand/5 hover:text-brand"
          onClick={onViewAll}
        >
          View All <ArrowRight className="h-3 w-3" />
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stages.map((stage, i) => (
          <div
            key={stage.key}
            className={`bp-enter stagger-${(i % 6) + 1} relative overflow-hidden rounded-xl border border-black/5 bg-canvas p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {stage.key}
              </span>
              <span className={`h-1.5 w-1.5 rounded-full ${stage.tone === "critical" ? "bg-critical bp-pulse-dot" : stage.tone === "warning" ? "bg-warning" : stage.tone === "success" ? "bg-success" : "bg-info"}`} />
            </div>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{stage.count}</p>
            <p className="text-[10px] text-muted-foreground">deliveries</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {previewCards.map((d) => (
          <div key={d.no} className="bp-enter rounded-lg border border-black/5 bg-white p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-brand">{d.no}</span>
              <Pill tone={toneForStatus(d.status)}>{d.status}</Pill>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-foreground">{d.customer}</p>
            <p className="truncate text-[11px] text-muted-foreground">{d.materials} · {d.area}</p>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground"><Clock className="mr-0.5 inline h-2.5 w-2.5" /> {d.promised.replace("Today, ", "")}</span>
              <span className="font-semibold">{d.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- 7.1d Cashier Workspace Summary ---------- */

export function CashierWorkspaceSummary({
  tiles,
  quickActions: actions = cashierWorkspaceSummary.quickActions.map((label) => ({ label, onClick: () => toast.info(label, { description: "Cashier action triggered." }) })),
}: {
  tiles?: { l: string; v: string; tone: Severity }[];
  quickActions?: { label: string; onClick: () => void }[];
}) {
  const defaultTiles: { l: string; v: string; tone: Severity }[] = [
    { l: "Active terminals", v: cashierWorkspaceSummary.activeTerminals, tone: "success" },
    { l: "Open shifts", v: String(cashierWorkspaceSummary.openShifts), tone: "info" },
    { l: "Parked sales", v: String(cashierWorkspaceSummary.parkedSales), tone: "warning" },
    { l: "Pending approvals", v: String(cashierWorkspaceSummary.pendingApprovals), tone: "warning" },
    { l: "Offline terminals", v: cashierWorkspaceSummary.offlineTerminals, tone: "critical" },
    { l: "Cash variance", v: cashierWorkspaceSummary.cashVariance, tone: "critical" },
  ];
  const rows = tiles ?? defaultTiles;
  return (
    <SectionCard title="Cashier Workspace Summary" desc="Terminals, shifts and cash reconciliation at a glance.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((t, i) => (
          <div
            key={t.l}
            className={`bp-enter stagger-${(i % 6) + 1} rounded-lg border border-black/5 bg-canvas p-2.5 transition hover:bg-white hover:shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.l}</p>
              <span className={`h-1.5 w-1.5 rounded-full ${t.tone === "critical" ? "bg-critical" : t.tone === "warning" ? "bg-warning" : t.tone === "success" ? "bg-success" : "bg-info"}`} />
            </div>
            <p className="mt-1 font-display text-sm font-bold tabular-nums text-foreground">{t.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- 7.1e Top Material Categories (compact) ---------- */

export function TopCategoriesCompact({
  onViewAll,
  categories = topCategories,
  topProductByCategory = {},
}: {
  onViewAll?: () => void;
  categories?: typeof topCategories;
  topProductByCategory?: Record<string, string>;
}) {
  return (
    <SectionCard
      title="Top Material Categories"
      desc="Highest-selling categories today with stock health."
      action={
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs text-brand hover:bg-brand/5 hover:text-brand"
          onClick={onViewAll}
        >
          View All <ArrowRight className="h-3 w-3" />
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Category", "Sales", "Units", "Stock", "Top product"].map((h) => (
              <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No sales recorded yet.</TableCell>
            </TableRow>
          )}
          {categories.slice(0, 6).map((c) => {
            const Icon = iconMap[c.icon] ?? Boxes;
            const tone = toneForStatus(c.health);
            const top = topProductByCategory;
            return (
              <TableRow key={c.name} className="bp-enter hover:bg-canvas">
                <TableCell>
                  <span className="flex items-center gap-2">
                    {categoryImage[c.name] ? (
                      <img
                        src={categoryImage[c.name]}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 rounded-md object-cover ring-1 ring-black/5 transition hover:scale-110"
                      />
                    ) : (
                      <span className={`grid h-8 w-8 place-items-center rounded-md ${toneIcon.info}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                    )}
                    <span className="font-medium text-foreground">{c.name}</span>
                  </span>
                </TableCell>
                <TableCell className="font-semibold tabular-nums">{formatSAR(c.sales)}</TableCell>
                <TableCell className="text-muted-foreground">{c.units}</TableCell>
                <TableCell><Pill tone={tone}>{c.health}</Pill></TableCell>
                <TableCell className="text-muted-foreground">{top[c.name] ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/* ---------- 7.2 Sales Performance KPIs & Recent Orders ---------- */

export function SalesPerfKpis({ items = salesPerfKpis }: { items?: typeof salesPerfKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((k, i) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <div
            key={k.key}
            className={`bp-enter stagger-${(i % 6) + 1} rounded-2xl border border-black/5 bg-white p-4 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{k.title}</p>
              <div className={`grid h-7 w-7 place-items-center rounded ${toneIcon[k.tone]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

export function RecentOrdersTable({
  onOpenAnalytics,
  orders = recentOrders,
}: {
  onOpenAnalytics?: () => void;
  orders?: typeof recentOrders;
}) {
  return (
    <SectionCard
      title="Recent Orders"
      desc="Latest 5 retail, contractor and trade-account tickets."
      action={
        <Button
          size="sm"
          className="h-8 gap-1 bg-brand text-xs text-brand-foreground hover:bg-brand/90"
          onClick={onOpenAnalytics}
        >
          Open Full Analytics <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Order", "Customer", "Type", "Value", "Status", "Payment", "Invoice"].map((h) => (
              <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No orders yet.</TableCell>
            </TableRow>
          )}
          {orders.map((o) => (
            <TableRow key={o.id} className="bp-enter hover:bg-canvas">
              <TableCell className="font-mono text-xs">{o.id}</TableCell>
              <TableCell className="font-medium">{o.customer}</TableCell>
              <TableCell>{o.type}</TableCell>
              <TableCell className="font-semibold tabular-nums">{o.value}</TableCell>
              <TableCell><Pill tone={toneForStatus(o.status)}>{o.status}</Pill></TableCell>
              <TableCell className="text-muted-foreground">{o.payment}</TableCell>
              <TableCell className="text-muted-foreground">{o.invoice}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/* ---------- 7.3 Inventory KPIs ---------- */

export function InventoryKpiGrid({ items = inventoryKpis }: { items?: typeof inventoryKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((k, i) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <div
            key={k.key}
            className={`bp-enter stagger-${(i % 6) + 1} rounded-2xl border border-black/5 bg-white p-4 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{k.title}</p>
              <div className={`grid h-7 w-7 place-items-center rounded ${toneIcon[k.tone]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 7.4 Delivery pipeline board (full, 6 lanes) ---------- */

export function DeliveryPipelineBoard({ cards: allCards = deliveryDetail }: { cards?: typeof deliveryDetail }) {
  const navigate = useNavigate();
  const lanes: { key: string; tone: Severity }[] = [
    { key: "Pending", tone: "warning" },
    { key: "Assigned", tone: "info" },
    { key: "Loading", tone: "info" },
    { key: "Dispatched", tone: "info" },
    { key: "Delivered", tone: "success" },
    { key: "Failed / Returned", tone: "critical" },
  ];
  return (
    <SectionCard title="Delivery & Dispatch Board" desc="Driver, vehicle, weight and area on every card.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {lanes.map((lane) => {
          const cards = allCards.filter((d) => d.status === lane.key);
          return (
            <div key={lane.key} className="rounded-xl border border-black/5 concrete-panel p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                  {lane.key}
                </span>
                <Pill tone={lane.tone}>{cards.length}</Pill>
              </div>
              <div className="space-y-2">
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed border-black/10 bg-white/60 p-3 text-center text-[11px] text-muted-foreground">
                    Empty lane
                  </div>
                )}
                {cards.map((d) => (
                  <div
                    key={d.no}
                    className="bp-enter cursor-pointer rounded-lg border border-black/5 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow"
                    onClick={() => navigate({ to: "/delivery/pipeline" })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold text-brand">{d.no}</span>
                      <span className="text-[10px] text-muted-foreground">{d.priority}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-foreground">{d.customer}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{d.materials}</p>
                    <p className="truncate text-[10px] text-muted-foreground">🚚 {d.driver} · {d.vehicle}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{d.area} · {d.weight}</span>
                      <span className="font-semibold">{d.amount}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Promised {d.promised}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {["Assign Driver", "Assign Vehicle", "Start Loading", "Mark Dispatched", "Mark Delivered", "Print Delivery Order", "View Timeline"].map((a) => (
          <Button key={a} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigate({ to: "/delivery/pipeline" })}>
            {a}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- 7.5 Cashier & Terminal ---------- */

export function CashierKpiGrid({ items = cashierKpis }: { items?: typeof cashierKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((k, i) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <div
            key={k.key}
            className={`bp-enter stagger-${(i % 6) + 1} rounded-2xl border border-black/5 bg-white p-4 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{k.title}</p>
              <div className={`grid h-7 w-7 place-items-center rounded ${toneIcon[k.tone]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

export function TerminalDetailTable({ rows = terminalDetail }: { rows?: typeof terminalDetail }) {
  const navigate = useNavigate();
  return (
    <SectionCard title="Terminal Status" desc="Cashier · shift · sales · sync · printer · card terminal.">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Terminal", "Cashier", "Shift", "Started", "Tx", "Sales", "Expected", "Sync", "Printer", "Card", "Status"].map((h) => (
                <TableHead key={h} className="text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">No shift activity yet.</TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.shift} className="bp-enter hover:bg-canvas">
                <TableCell className="font-mono text-xs">{t.term}</TableCell>
                <TableCell className="font-medium">{t.cashier}</TableCell>
                <TableCell className="font-mono text-xs">{t.shift}</TableCell>
                <TableCell>{t.started}</TableCell>
                <TableCell className="tabular-nums">{t.tx}</TableCell>
                <TableCell className="font-semibold tabular-nums">{t.sales}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{t.expected}</TableCell>
                <TableCell className="text-muted-foreground">{t.sync}</TableCell>
                <TableCell className="text-muted-foreground">{t.printer}</TableCell>
                <TableCell className="text-muted-foreground">{t.card}</TableCell>
                <TableCell><Pill tone={toneForStatus(t.status)}>{t.status}</Pill></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["View Shift", "Print X-Report", "Request Cash Count", "Review Variance", "Recall Parked Sale", "Reassign Cashier"].map((a) => (
          <Button key={a} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigate({ to: "/operate/cashier-shift" })}>
            {a}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- 7.6 Payments & Returns ---------- */

export function PaymentBreakdownTiles({ items = paymentBreakdown }: { items?: typeof paymentBreakdown }) {
  return (
    <SectionCard title="Payment Summary" desc="Today's collections by method (Card replaces Mada).">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>}
        {items.map((p, i) => {
          const Icon = iconMap[p.icon] ?? Receipt;
          return (
            <div
              key={p.method}
              className={`bp-enter stagger-${(i % 6) + 1} rounded-xl border border-black/5 bg-canvas p-3 transition hover:bg-white hover:shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${toneIcon[p.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] text-muted-foreground">{p.tx} tx</span>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">{p.method}</p>
              <p className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground">{p.amount}</p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function ReturnBreakdownTiles({ items = returnBreakdown }: { items?: typeof returnBreakdown }) {
  return (
    <SectionCard title="Return Summary" desc="Standard, damaged, surplus, exchanges, VAT reversal and restocking.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {items.map((r) => (
          <div key={r.label} className="rounded-lg border border-black/5 bg-canvas p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.label}</p>
            <p className="mt-1 font-display text-sm font-bold tabular-nums text-foreground">{r.value}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- 7.7 Compliance & Alerts grouped ---------- */

type AlertItem = (typeof groupedAlerts)[number] & { link?: string | null };

export function AlertsByGroup({
  alerts: allAlerts = groupedAlerts,
  onAction,
}: {
  alerts?: AlertItem[];
  onAction?: (a: AlertItem) => void;
}) {
  const groups: { sev: Severity; title: string }[] = [
    { sev: "critical", title: "Critical" },
    { sev: "warning", title: "Warning" },
    { sev: "info", title: "Information" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {groups.map(({ sev, title }) => {
        const list = allAlerts.filter((a) => a.severity === sev);
        return (
          <SectionCard
            key={sev}
            title={title}
            desc={`${list.length} ${title.toLowerCase()} alert${list.length === 1 ? "" : "s"}.`}
            action={<Pill tone={sev}>{list.length}</Pill>}
          >
            <div className="space-y-2">
              {list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/10 bg-canvas p-4 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-success" />
                  All clear
                </div>
              ) : (
                list.map((a, i) => (
                  <div
                    key={i}
                    className="bp-enter rounded-lg border border-black/5 bg-canvas p-2.5 transition hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <Pill tone={sev}>{a.module}</Pill>
                      <span className="text-[10px] text-muted-foreground">{a.age} ago</span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium leading-snug text-foreground">{a.msg}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-[11px] text-brand hover:bg-brand/10 hover:text-brand"
                      onClick={() => (onAction ? onAction(a) : toast.success(a.action, { description: a.msg }))}
                    >
                      {a.action} <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
