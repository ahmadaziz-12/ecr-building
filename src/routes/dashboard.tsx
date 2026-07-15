import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import yardScene from "@/assets/yard-scene.jpg";
import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Truck,
  UserSquare2,
  Wallet,
  Shield,
  HardHat,
  RefreshCw,
  Download,
  Radio,
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
  CommandKpis,
  ContractorOrders,
  DispatchBoard,
  StockYardHealth,
  AlertsRail,
} from "@/components/buildpos/sections";
import { useFilters } from "@/lib/buildpos/filter-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  component: OverviewPage,
});

function OverviewPage() {
  const { activeTab, setActiveTab } = useFilters();

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
      {/* Industrial Command Header — narrow, control-room feel */}
      <section className="bp-fade relative overflow-hidden rounded-2xl border border-brand/20 shadow-[0_10px_30px_-18px_rgba(59,20,120,0.5)]">
        <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.22_0.08_285)] via-[oklch(0.3_0.11_285)] to-[oklch(0.35_0.13_285)]" />
        <img
          src={yardScene}
          alt=""
          aria-hidden
          className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-30 mix-blend-luminosity"
          width={1600}
          height={900}
        />
        <div className="absolute inset-0 blueprint-grid-dark opacity-40" />
        <div className="absolute inset-x-0 bottom-0 h-1 hazard-stripe opacity-80" />
        <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-center gap-4 text-white">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/20">
              <Radio className="h-5 w-5 text-teal" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur">
                <HardHat className="h-3 w-3 text-teal" /> BuildPOS · Command Center
              </span>
              <h1 className="mt-1 font-display text-xl font-bold leading-tight md:text-2xl">
                Industrial Operations · Riyadh Main Yard
              </h1>
              <p className="text-[12px] text-white/70">
                Cement · Steel · Tiles · Paint · Plumbing · Electrical · Glass · Tools — live across 5 KSA branches
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-9 gap-1.5 border border-white/20 bg-white/10 text-xs text-white backdrop-blur hover:bg-white/20 hover:text-white"
              onClick={() => toast.success("Dashboard refreshed", { description: "Data pulled from live POS & warehouse feeds." })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-white text-xs font-semibold text-brand hover:bg-white/90"
              onClick={() => toast.success("Export queued", { description: "Command Center snapshot will be emailed." })}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>
      </section>

      {/* Top Command Bar — full-width filter surface */}
      <div className="bp-fade sticky top-16 z-[5] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
        <FilterBar />
      </div>

      {/* Construction Operations Summary — wider industrial KPI tiles */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            01 · Construction Operations Summary
          </h2>
        </div>
        <CommandKpis />
      </section>

      {/* Main grid: operations column + right-side alerts rail */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Material Sales Intelligence */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-teal" />
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                02 · Material Sales Intelligence
              </h2>
            </div>
            <div className="bp-enter"><TopCategories /></div>
          </section>

          {/* Stock Yard / Warehouse Health */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-safety-amber" />
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                03 · Stock Yard & Warehouse Health
              </h2>
            </div>
            <div className="bp-enter"><StockYardHealth /></div>
          </section>

          {/* Contractor & B2B Orders */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-info" />
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                04 · Contractor & B2B Orders
              </h2>
            </div>
            <div className="bp-enter"><ContractorOrders /></div>
          </section>

          {/* Delivery & Dispatch Yard */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-critical" />
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                05 · Delivery & Dispatch Yard
              </h2>
            </div>
            <div className="bp-enter"><DispatchBoard /></div>
          </section>
        </div>

        {/* Right-side control panel */}
        <aside className="space-y-4">
          <AlertsRail />
        </aside>
      </div>

      {/* Deep Dive tabs — preserves all existing sections & functionality */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            06 · Deep Dive · Operational Detail
          </h2>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
      </section>
    </div>
  );
}