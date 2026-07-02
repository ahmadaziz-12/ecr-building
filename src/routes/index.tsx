import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  Clock,
  FileText,
  Hammer,
  History,
  Layers,
  LayoutGrid,
  Package,
  PaintBucket,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShoppingCart,
  Square,
  Truck,
  Users,
  Wrench,
  Zap,
  Radio,
  CheckCircle2,
  Circle,
  Wifi,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatSAR, severityClass, type Severity } from "@/lib/buildpos/format";
import {
  alerts,
  branches,
  deliveries,
  deliveryChips,
  filters,
  hourlySales,
  inventorySummary,
  kpis,
  lowStock,
  payments,
  quickActions,
  returns as returnsData,
  returnsSummary,
  shifts,
  statusBar,
  terminals,
  topCategories,
  zatcaInvoices,
} from "@/lib/buildpos/data";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

/* ---------------- helpers ---------------- */

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trending: TrendingUp,
  receipt: Receipt,
  cart: ShoppingCart,
  shield: Shield,
  package: Package,
  truck: Truck,
  users: Users,
  alert: AlertTriangle,
  layers: Layers,
  bar: BarChart3,
  grid: LayoutGrid,
  paint: PaintBucket,
  pipe: Wrench,
  zap: Zap,
  hammer: Hammer,
  square: Square,
  plus: Plus,
  history: History,
  file: FileText,
  search: Search,
  chart: BarChart3,
  refresh: RefreshCw,
  power: Power,
};

function SeverityPill({ tone, children }: { tone: Severity; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityClass[tone]}`}
    >
      {children}
    </span>
  );
}

function toneForStatus(s: string): Severity {
  const key = s.toLowerCase();
  if (["critical", "failed", "offline"].some((k) => key.includes(k))) return "critical";
  if (["low", "warning", "pending", "queued", "idle", "needs", "quarantine"].some((k) => key.includes(k)))
    return "warning";
  if (["active", "cleared", "delivered", "completed", "reconciled", "healthy", "success", "submitted"].some((k) =>
    key.includes(k)
  ))
    return "success";
  if (["assigned", "dispatched", "posted", "open", "normal"].some((k) => key.includes(k))) return "info";
  return "muted";
}

/* ---------------- backdrop ---------------- */

function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,oklch(0.42_0.22_295)_0%,transparent_55%),radial-gradient(circle_at_85%_10%,oklch(0.55_0.2_320)_0%,transparent_50%),linear-gradient(180deg,oklch(0.18_0.08_285)_0%,oklch(0.14_0.06_280)_60%,oklch(0.11_0.05_280)_100%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* faint construction shapes */}
      <svg className="absolute right-[-80px] top-40 h-80 w-80 opacity-[0.06]" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="0.6">
        <rect x="10" y="10" width="30" height="30" />
        <rect x="45" y="10" width="30" height="30" />
        <rect x="10" y="45" width="30" height="30" />
        <rect x="45" y="45" width="30" height="30" />
        <circle cx="80" cy="80" r="12" />
      </svg>
      <svg className="absolute left-[-60px] bottom-20 h-72 w-72 opacity-[0.06]" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="0.6">
        <path d="M10 80 L30 20 L50 80 Z" />
        <path d="M55 80 L75 20 L95 80 Z" />
        <line x1="0" y1="90" x2="100" y2="90" />
      </svg>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`border-white/10 bg-white/[0.06] text-white shadow-[0_10px_40px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl ${className}`}
    >
      {children}
    </Card>
  );
}

function StatusBar() {
  const items = [
    { label: "Branch", value: statusBar.branch },
    { label: "Terminal", value: statusBar.terminal },
    { label: "User", value: `${statusBar.user} · ${statusBar.role}` },
    { label: "Business Date", value: statusBar.businessDate },
  ];
  return (
    <div className="border-b border-white/10 bg-black/20 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2.5 text-xs text-white/80">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-brand to-brand-glow text-brand-foreground font-bold">
            M
          </div>
          <span className="font-semibold text-white">Mi Money · BuildPOS</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {items.map((i) => (
            <span key={i.label} className="flex items-center gap-1.5">
              <span className="text-white/50">{i.label}:</span>
              <span className="text-white">{i.value}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityPill tone="success">
            <Circle className="h-2 w-2 fill-current" /> Shift {statusBar.shift}
          </SeverityPill>
          <SeverityPill tone="success">
            <Wifi className="h-3 w-3" /> {statusBar.sync}
          </SeverityPill>
          <SeverityPill tone="info">
            <Shield className="h-3 w-3" /> ZATCA {statusBar.zatca}
          </SeverityPill>
          <span className="text-white/70">{statusBar.currency}</span>
        </div>
      </div>
    </div>
  );
}

function DashboardHeader() {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Building Materials Dashboard
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-white/70">
          Real-time view of sales, stock movement, cashier activity, deliveries, and operational alerts
          across your building material stores.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/60">
        <Clock className="h-4 w-4" /> Last updated {statusBar.lastUpdated} · auto-refresh 60s
      </div>
    </div>
  );
}

function FilterBar() {
  const groups: { label: string; options: string[]; def: string }[] = [
    { label: "Date", options: filters.dateRange, def: "Today" },
    { label: "Branch", options: filters.branch, def: "Riyadh Main" },
    { label: "Terminal", options: filters.terminal, def: "POS-01" },
    { label: "Cashier", options: filters.cashier, def: "Ahmed" },
    { label: "Category", options: filters.category, def: "Cement" },
    { label: "Payment", options: filters.payment, def: "Cash" },
    { label: "Alert", options: filters.alertType, def: "Stock" },
    { label: "Stock", options: filters.stockStatus, def: "Available" },
    { label: "Delivery", options: filters.deliveryStatus, def: "Pending" },
  ];
  return (
    <GlassCard className="p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9">
        {groups.map((g) => (
          <Select key={g.label} defaultValue={g.def}>
            <SelectTrigger className="h-9 border-white/10 bg-white/5 text-xs text-white">
              <SelectValue placeholder={g.label} />
            </SelectTrigger>
            <SelectContent>
              {g.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
    </GlassCard>
  );
}

function KpiGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k) => {
        const Icon = iconMap[k.icon] ?? Package;
        return (
          <GlassCard key={k.key} className="group cursor-pointer p-4 transition hover:bg-white/[0.09]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/60">{k.title}</p>
                <p className="mt-2 font-display text-2xl font-bold text-white">{k.value}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl border ${severityClass[k.tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <SeverityPill tone={k.tone}>{k.sub}</SeverityPill>
              <ChevronRight className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

function QuickActions() {
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-white/80">
          Quick Actions
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {quickActions.map((a) => {
          const Icon = iconMap[a.icon] ?? Plus;
          return (
            <Button
              key={a.label}
              variant="outline"
              className="relative h-auto flex-col gap-1.5 border-white/10 bg-white/5 py-3 text-white hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{a.label}</span>
              {a.badge != null && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-foreground">
                  {a.badge}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </GlassCard>
  );
}

function SalesPerformance() {
  return (
    <GlassCard className="p-4 lg:col-span-2">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Sales Performance</h2>
          <p className="text-xs text-white/60">
            Hourly gross vs net sales, returns, and VAT collected across today.
          </p>
        </div>
        <SeverityPill tone="success">Live</SeverityPill>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourlySales} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.18 310)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.72 0.18 310)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.68 0.15 235)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="oklch(0.68 0.15 235)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.6)" fontSize={11} />
            <YAxis stroke="rgba(255,255,255,0.6)" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.2 0.06 285)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                color: "white",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }} />
            <Area type="monotone" dataKey="gross" stroke="oklch(0.72 0.18 310)" fill="url(#gross)" name="Gross" />
            <Area type="monotone" dataKey="net" stroke="oklch(0.68 0.15 235)" fill="url(#net)" name="Net" />
            <Line type="monotone" dataKey="returns" stroke="oklch(0.62 0.24 25)" name="Returns" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

const PIE_COLORS = [
  "oklch(0.72 0.18 310)",
  "oklch(0.68 0.15 235)",
  "oklch(0.78 0.16 70)",
  "oklch(0.68 0.17 155)",
  "oklch(0.62 0.24 25)",
  "oklch(0.55 0.22 295)",
];

function PaymentCollection() {
  const total = payments.reduce((s, p) => s + p.amount, 0);
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Payment Collection</h2>
        <p className="text-xs text-white/60">Today · {formatSAR(total)} collected</p>
      </div>
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={payments}
                dataKey="amount"
                nameKey="method"
                innerRadius={45}
                outerRadius={80}
                stroke="none"
              >
                {payments.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.2 0.06 285)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  color: "white",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5">
          {payments.map((p, i) => (
            <div key={p.method} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-white/80">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                {p.method}
              </span>
              <span className="font-semibold text-white">{formatSAR(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function TopCategories() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Top Material Categories</h2>
        <p className="text-xs text-white/60">Highest-selling building material categories today.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {topCategories.map((c) => {
          const Icon = iconMap[c.icon] ?? Boxes;
          const tone = toneForStatus(c.health);
          return (
            <div
              key={c.name}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.08]"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/20 text-brand-glow">
                  <Icon className="h-4 w-4" />
                </div>
                <SeverityPill tone={tone}>{c.health}</SeverityPill>
              </div>
              <p className="mt-3 text-sm font-medium text-white">{c.name}</p>
              <p className="mt-1 font-display text-lg font-bold text-white">{formatSAR(c.sales)}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-white/60">
                <span>{c.units}</span>
                <span>Returns {c.ret}</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function InventoryHealth() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Stock Health & Availability</h2>
          <p className="text-xs text-white/60">Availability across branches and warehouses.</p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-white/80 hover:bg-white/10 hover:text-white">
          Open Low Stock Report <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {inventorySummary.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-white/50">{s.label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["SKU", "Product", "Category", "Branch", "Available", "Reorder", "Supplier", "Status"].map((h) => (
                <TableHead key={h} className="text-white/60">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowStock.map((r) => (
              <TableRow key={r.sku} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.cat}</TableCell>
                <TableCell>{r.branch}</TableCell>
                <TableCell>{r.qty}</TableCell>
                <TableCell className="text-white/60">{r.reorder}</TableCell>
                <TableCell>{r.supplier}</TableCell>
                <TableCell>
                  <SeverityPill tone={toneForStatus(String(r.status))}>
                    {String(r.status).charAt(0).toUpperCase() + String(r.status).slice(1)}
                  </SeverityPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function CashierActivity() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Cashier & Terminal Activity</h2>
        <p className="text-xs text-white/60">Shifts, transactions, sync status, and cash variance.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["Terminal", "Cashier", "Shift Start", "Tx", "Sales", "Expected Cash", "Last Sync", "Status"].map(
                (h) => (
                  <TableHead key={h} className="text-white/60">
                    {h}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {terminals.map((t) => (
              <TableRow key={t.term} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-mono text-xs">{t.term}</TableCell>
                <TableCell>{t.cashier}</TableCell>
                <TableCell>{t.start}</TableCell>
                <TableCell>{t.tx}</TableCell>
                <TableCell className="font-semibold">{t.sales}</TableCell>
                <TableCell className="text-white/60">{t.cash}</TableCell>
                <TableCell className="text-white/60">{t.sync}</TableCell>
                <TableCell>
                  <SeverityPill tone={toneForStatus(String(t.status))}>{String(t.status)}</SeverityPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-white/80">Shift Summary</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                {["Shift", "Cashier", "Opening", "Cash Sales", "Expected", "Counted", "Variance", "Status"].map(
                  (h) => (
                    <TableHead key={h} className="text-white/60">
                      {h}
                    </TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell>{s.cashier}</TableCell>
                  <TableCell>{formatSAR(s.opening)}</TableCell>
                  <TableCell>{formatSAR(s.cash)}</TableCell>
                  <TableCell>{formatSAR(s.expected)}</TableCell>
                  <TableCell>{formatSAR(s.counted)}</TableCell>
                  <TableCell className={s.variance < 0 ? "text-critical" : "text-white/70"}>
                    {s.variance === 0 ? "0" : formatSAR(s.variance)}
                  </TableCell>
                  <TableCell>
                    <SeverityPill tone={toneForStatus(s.status)}>{s.status}</SeverityPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </GlassCard>
  );
}

function DeliveryQueue() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Delivery & Dispatch Queue</h2>
        <p className="text-xs text-white/60">Contractor orders, bulky material, and route status.</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {deliveryChips.map((c) => (
          <SeverityPill key={c.label} tone={c.tone}>
            {c.label}: <span className="ml-1 font-bold">{c.value}</span>
          </SeverityPill>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["Delivery No.", "Customer", "Area", "Items", "Time", "Driver", "Status", "Amount"].map((h) => (
                <TableHead key={h} className="text-white/60">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => (
              <TableRow key={d.no} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-mono text-xs">{d.no}</TableCell>
                <TableCell>{d.customer}</TableCell>
                <TableCell>{d.area}</TableCell>
                <TableCell>{d.items}</TableCell>
                <TableCell>{d.time}</TableCell>
                <TableCell className="text-white/60">{d.driver}</TableCell>
                <TableCell>
                  <SeverityPill tone={toneForStatus(String(d.status))}>{String(d.status)}</SeverityPill>
                </TableCell>
                <TableCell className="font-semibold">{d.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function OperationalAlerts() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Critical Alerts</h2>
          <p className="text-xs text-white/60">Requires supervisor or store manager action.</p>
        </div>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {alerts.length} active
        </Badge>
      </div>
      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <div className={`grid h-8 w-8 flex-none place-items-center rounded-lg border ${severityClass[a.severity]}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <SeverityPill tone={a.severity}>{a.module}</SeverityPill>
                  <span className="text-[11px] text-white/50">{a.age} ago</span>
                </div>
                <p className="mt-1 text-sm text-white/90">{a.msg}</p>
                <p className="text-[11px] text-white/50">Assigned to {a.owner}</p>
              </div>
            </div>
            <div className="flex gap-2 pl-11 sm:pl-0">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-white/80 hover:bg-white/10 hover:text-white">
                Acknowledge
              </Button>
              <Button size="sm" className="h-7 bg-brand text-brand-foreground text-xs hover:bg-brand/90">
                {a.action}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function ReturnsRefunds() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Returns & Refunds</h2>
        <p className="text-xs text-white/60">Standard, damaged, and surplus returns with VAT reversal.</p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {returnsSummary.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-white/50">{s.label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["Return", "Invoice", "Customer", "Type", "Product", "Refund", "Reason", "Status", "Approved By"].map(
                (h) => (
                  <TableHead key={h} className="text-white/60">
                    {h}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {returnsData.map((r) => (
              <TableRow key={r.id} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="font-mono text-xs">{r.inv}</TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>{r.product}</TableCell>
                <TableCell className="font-semibold">{r.amount}</TableCell>
                <TableCell className="text-white/60">{r.reason}</TableCell>
                <TableCell>
                  <SeverityPill tone={toneForStatus(String(r.status))}>{String(r.status)}</SeverityPill>
                </TableCell>
                <TableCell className="text-white/60">{r.by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function BranchPerformance() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">Branch Performance</h2>
        <p className="text-xs text-white/60">Snapshot across all Mi Money branches.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["Branch", "Sales", "Tx", "Returns", "Avg Basket", "Low Stock", "Open Shifts", "Status"].map((h) => (
                <TableHead key={h} className="text-white/60">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((b) => (
              <TableRow key={b.branch} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-medium">{b.branch}</TableCell>
                <TableCell className="font-semibold">{b.sales}</TableCell>
                <TableCell>{b.tx}</TableCell>
                <TableCell className="text-white/70">{b.returns}</TableCell>
                <TableCell>{b.basket}</TableCell>
                <TableCell>{b.low}</TableCell>
                <TableCell>{b.shifts}</TableCell>
                <TableCell>
                  <SeverityPill tone="success">Active</SeverityPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function ZatcaCompliance() {
  return (
    <GlassCard className="p-4">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white">ZATCA & Compliance</h2>
        <p className="text-xs text-white/60">Invoice clearance and submission status.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {["Invoice", "Order", "Type", "Amount", "VAT", "Status", "Error", "Action"].map((h) => (
                <TableHead key={h} className="text-white/60">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {zatcaInvoices.map((z) => (
              <TableRow key={z.no} className="border-white/5 text-white/90 hover:bg-white/[0.04]">
                <TableCell className="font-mono text-xs">{z.no}</TableCell>
                <TableCell className="font-mono text-xs">{z.order}</TableCell>
                <TableCell>{z.type}</TableCell>
                <TableCell>{z.amount}</TableCell>
                <TableCell>{z.vat}</TableCell>
                <TableCell>
                  <SeverityPill tone={toneForStatus(String(z.status))}>{String(z.status)}</SeverityPill>
                </TableCell>
                <TableCell className="font-mono text-xs text-white/60">{z.err}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-white/80 hover:bg-white/10 hover:text-white">
                    {z.action}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

/* ---------------- page ---------------- */

function Dashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen font-sans text-white">
      <Backdrop />
      <StatusBar />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 md:px-6">
        <DashboardHeader />
        <FilterBar />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full flex-wrap justify-start gap-1 border border-white/10 bg-white/[0.04] p-1">
            {[
              ["overview", "Overview"],
              ["sales", "Sales"],
              ["inventory", "Inventory"],
              ["delivery", "Delivery"],
              ["cashier", "Cashier Activity"],
              ["compliance", "Compliance"],
            ].map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground text-white/70"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <KpiGrid />
            <QuickActions />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SalesPerformance />
              <PaymentCollection />
            </div>
            <TopCategories />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <InventoryHealth />
              <OperationalAlerts />
            </div>
            <DeliveryQueue />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ReturnsRefunds />
              <BranchPerformance />
            </div>
          </TabsContent>

          <TabsContent value="sales" className="mt-4 space-y-4">
            <KpiGrid />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SalesPerformance />
              <PaymentCollection />
            </div>
            <TopCategories />
            <BranchPerformance />
          </TabsContent>

          <TabsContent value="inventory" className="mt-4 space-y-4">
            <InventoryHealth />
            <TopCategories />
          </TabsContent>

          <TabsContent value="delivery" className="mt-4 space-y-4">
            <DeliveryQueue />
          </TabsContent>

          <TabsContent value="cashier" className="mt-4 space-y-4">
            <CashierActivity />
          </TabsContent>

          <TabsContent value="compliance" className="mt-4 space-y-4">
            <ZatcaCompliance />
            <OperationalAlerts />
          </TabsContent>
        </Tabs>

        <footer className="mt-6 border-t border-white/10 pt-4 text-center text-xs text-white/50">
          Last Updated: {statusBar.lastUpdated} · Auto refresh every 60 seconds · Data: POS transactions,
          inventory, cashier shifts, delivery orders, ZATCA invoice status, and payment records.
        </footer>
      </div>
    </div>
  );
}
