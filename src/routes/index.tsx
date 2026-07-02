import { createFileRoute } from "@tanstack/react-router";
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
} from "@/components/buildpos/sections";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <div className="space-y-4">
      <FilterBar />
      <KpiGrid />
      <QuickActions />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><SalesPerformance /></div>
        <PaymentCollection />
      </div>
      <TopCategories />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InventoryHealth />
        <OperationalAlerts />
      </div>
      <DeliveryQueue />
      <BranchPerformance />
    </div>
  );
}