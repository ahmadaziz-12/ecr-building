import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, Truck, UserSquare2, ShieldCheck } from "lucide-react";
import {
  FilterBar,
  KpiGrid,
  QuickActions,
  SalesPerformance,
  PaymentCollection,
  TopCategories,
  InventoryHealth,
  OperationalAlerts,
  DeliveryQueue,
  BranchPerformance,
  ZatcaCompliance,
  CashierActivity,
} from "@/components/buildpos/sections";
import { alerts, deliveryChips, inventorySummary, zatcaInvoices, terminals } from "@/lib/buildpos/data";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function PriorityTile({
  tone,
  icon: Icon,
  label,
  value,
  hint,
  pulse,
  delay,
}: {
  tone: "critical" | "warning" | "success" | "info" | "brand";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint: string;
  pulse?: boolean;
  delay: string;
}) {
  const toneMap = {
    critical: "from-critical/10 to-critical/0 border-critical/20 text-critical",
    warning: "from-warning/15 to-warning/0 border-warning/30 text-[oklch(0.4_0.13_70)]",
    success: "from-success/10 to-success/0 border-success/30 text-[oklch(0.35_0.1_155)]",
    info: "from-info/10 to-info/0 border-info/30 text-[oklch(0.35_0.12_235)]",
    brand: "from-brand/10 to-brand/0 border-brand/20 text-brand",
  } as const;
  return (
    <div
      className={`bp-enter ${delay} relative overflow-hidden rounded-2xl border bg-gradient-to-br ${toneMap[tone]} bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-40" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <div className={`relative grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/80 ${pulse ? "bp-pulse-dot" : ""}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function OverviewPage() {
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const lowStock = inventorySummary.find((s) => /low/i.test(s.label))?.value ?? "0";
  const pendingDeliveries = deliveryChips.find((c) => /pending|queued/i.test(c.label))?.value ?? "0";
  const activeCashiers = terminals.filter((t) => String(t.status).toLowerCase().includes("active")).length;
  const zatcaFailed = zatcaInvoices.filter((z) => /fail|error/i.test(String(z.status))).length;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bp-fade"><FilterBar /></div>

      {/* Priority strip — what a manager scans first */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-critical bp-pulse-dot" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Priority · Requires attention
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <PriorityTile tone="critical" icon={AlertTriangle} label="Critical alerts" value={criticalAlerts} hint="Escalate now" pulse delay="stagger-1" />
          <PriorityTile tone="warning" icon={Package} label="Low stock SKUs" value={lowStock} hint="Reorder queue" delay="stagger-2" />
          <PriorityTile tone="info" icon={Truck} label="Pending deliveries" value={pendingDeliveries} hint="Dispatch backlog" delay="stagger-3" />
          <PriorityTile tone="success" icon={UserSquare2} label="Active cashiers" value={activeCashiers} hint="Live shifts" delay="stagger-4" />
          <PriorityTile tone="brand" icon={ShieldCheck} label="ZATCA failures" value={zatcaFailed} hint="Resubmit queue" delay="stagger-5" />
        </div>
      </section>

      {/* Headline KPIs */}
      <div className="bp-enter stagger-2"><KpiGrid /></div>

      {/* Quick actions */}
      <div className="bp-enter stagger-3"><QuickActions /></div>

      {/* Sales + payments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bp-enter stagger-4 lg:col-span-2"><SalesPerformance /></div>
        <div className="bp-enter stagger-5"><PaymentCollection /></div>
      </div>

      {/* Consolidated operations — tabbed to reduce vertical clutter */}
      <section className="bp-enter stagger-6 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)] md:p-5">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-foreground">Operations Center</h2>
          <p className="text-xs text-muted-foreground">
            Grouped view across stock, deliveries, cashiers, compliance, and branches.
          </p>
        </div>
        <Tabs defaultValue="alerts" className="w-full">
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-canvas p-1">
            <TabsTrigger value="alerts" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Alerts
            </TabsTrigger>
            <TabsTrigger value="stock" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Stock
            </TabsTrigger>
            <TabsTrigger value="delivery" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Delivery
            </TabsTrigger>
            <TabsTrigger value="cashier" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Cashier
            </TabsTrigger>
            <TabsTrigger value="zatca" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              ZATCA
            </TabsTrigger>
            <TabsTrigger value="branches" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Branches
            </TabsTrigger>
            <TabsTrigger value="categories" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm">
              Categories
            </TabsTrigger>
          </TabsList>
          <TabsContent value="alerts" className="bp-fade"><OperationalAlerts /></TabsContent>
          <TabsContent value="stock" className="bp-fade"><InventoryHealth /></TabsContent>
          <TabsContent value="delivery" className="bp-fade"><DeliveryQueue /></TabsContent>
          <TabsContent value="cashier" className="bp-fade"><CashierActivity /></TabsContent>
          <TabsContent value="zatca" className="bp-fade"><ZatcaCompliance /></TabsContent>
          <TabsContent value="branches" className="bp-fade"><BranchPerformance /></TabsContent>
          <TabsContent value="categories" className="bp-fade"><TopCategories /></TabsContent>
        </Tabs>
      </section>
    </div>
  );
}