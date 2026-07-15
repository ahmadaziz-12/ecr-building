import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Truck,
  UserSquare2,
  Wallet,
  Shield,
} from "lucide-react";
import {
  FilterBar,
  DashboardHeader,
  OverviewKpis,
  HourlySummary,
  TopCategoriesCompact,
  DispatchPipelinePreview,
  CashierWorkspaceSummary,
  SalesPerfKpis,
  RecentOrdersTable,
  InventoryKpiGrid,
  InventoryHealth,
  DeliveryPipelineBoard,
  CashierKpiGrid,
  TerminalDetailTable,
  PaymentBreakdownTiles,
  ReturnBreakdownTiles,
  AlertsByGroup,
  SalesPerformance,
  BranchPerformance,
} from "@/components/buildpos/sections";
import { useFilters } from "@/lib/buildpos/filter-context";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Building Materials Operations — BuildPOS" },
      {
        name: "description",
        content:
          "BuildPOS Command Center — sales, inventory, dispatch, cashiers, payments and ZATCA compliance for KSA building-material retailers.",
      },
      { property: "og:title", content: "Building Materials Operations — BuildPOS" },
      {
        property: "og:description",
        content:
          "Live dashboard for construction retail: cement, steel, tiles, paint, plumbing, electrical across every branch.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { activeTab, setActiveTab } = useFilters();
  const navigate = useNavigate();

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
      <DashboardHeader subtitle="Monitor today's sales, transactions, stock risks, deliveries, and active shifts across your building-material branches." />

      {/* Global filter bar */}
      <div className="bp-fade sticky top-16 z-[5] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
        <FilterBar />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-[7.5rem] z-[4] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
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

        {/* 1. Overview */}
        <TabsContent value="overview" className="bp-fade space-y-4">
          <OverviewKpis />
          <HourlySummary />
          <TopCategoriesCompact onViewAll={() => { setActiveTab("sales"); toast.info("Opening full category performance"); }} />
          <DispatchPipelinePreview onViewAll={() => setActiveTab("delivery")} />
          <CashierWorkspaceSummary />
        </TabsContent>

        {/* 2. Sales Performance */}
        <TabsContent value="sales" className="bp-fade space-y-4">
          <SalesPerfKpis />
          <SalesPerformance />
          <TopCategoriesCompact />
          <BranchPerformance />
          <RecentOrdersTable onOpenAnalytics={() => { navigate({ to: "/insights/bi" }); }} />
        </TabsContent>

        {/* 3. Inventory Health */}
        <TabsContent value="inventory" className="bp-fade space-y-4">
          <InventoryKpiGrid />
          <InventoryHealth />
        </TabsContent>

        {/* 4. Delivery & Dispatch */}
        <TabsContent value="delivery" className="bp-fade space-y-4">
          <DeliveryPipelineBoard />
        </TabsContent>

        {/* 5. Cashier & Terminal */}
        <TabsContent value="cashier" className="bp-fade space-y-4">
          <CashierKpiGrid />
          <TerminalDetailTable />
        </TabsContent>

        {/* 6. Payments & Returns */}
        <TabsContent value="payments" className="bp-fade space-y-4">
          <PaymentBreakdownTiles />
          <ReturnBreakdownTiles />
        </TabsContent>

        {/* 7. Compliance & Alerts */}
        <TabsContent value="compliance" className="bp-fade space-y-4">
          <AlertsByGroup />
        </TabsContent>
      </Tabs>
    </div>
  );
}
