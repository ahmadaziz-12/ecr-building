import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Package,
  Truck,
  UserSquare2,
  ShieldCheck,
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Wallet,
  Shield,
} from "lucide-react";
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
  ReturnsRefunds,
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

  const tabs = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "sales", label: "Sales Performance", icon: TrendingUp },
    { value: "inventory", label: "Inventory Health", icon: Boxes },
    { value: "delivery", label: "Delivery & Dispatch", icon: Truck },
    { value: "cashier", label: "Cashier & Terminal", icon: UserSquare2 },
    { value: "payments", label: "Payments & Returns", icon: Wallet },
    { value: "compliance", label: "Compliance & Alerts", icon: Shield },
  ];

  return (
    <div className="space-y-5">
      {/* Sticky filter bar controls all sections */}
      <div className="bp-fade sticky top-16 z-[5] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/80 backdrop-blur">
        <FilterBar />
      </div>

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

      {/* Sectioned operations — 7 grouped tabs matching the operational workflow */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="sticky top-32 z-[4] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-black/5 bg-white p-1 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="gap-1.5 px-3 text-xs data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* 1. Overview — headline KPIs + quick actions */}
        <TabsContent value="overview" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><KpiGrid /></div>
          <div className="bp-enter stagger-2"><QuickActions /></div>
        </TabsContent>

        {/* 2. Sales Performance — trend + categories + branches */}
        <TabsContent value="sales" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><SalesPerformance /></div>
          <div className="bp-enter stagger-2"><TopCategories /></div>
          <div className="bp-enter stagger-3"><BranchPerformance /></div>
        </TabsContent>

        {/* 3. Inventory Health */}
        <TabsContent value="inventory" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><InventoryHealth /></div>
        </TabsContent>

        {/* 4. Delivery & Dispatch */}
        <TabsContent value="delivery" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><DeliveryQueue /></div>
        </TabsContent>

        {/* 5. Cashier & Terminal */}
        <TabsContent value="cashier" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><CashierActivity /></div>
        </TabsContent>

        {/* 6. Payments & Returns */}
        <TabsContent value="payments" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><PaymentCollection /></div>
          <div className="bp-enter stagger-2"><ReturnsRefunds /></div>
        </TabsContent>

        {/* 7. Compliance & Alerts */}
        <TabsContent value="compliance" className="bp-fade space-y-4">
          <div className="bp-enter stagger-1"><OperationalAlerts /></div>
          <div className="bp-enter stagger-2"><ZatcaCompliance /></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}