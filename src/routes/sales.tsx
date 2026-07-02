import { createFileRoute } from "@tanstack/react-router";
import {
  FilterBar, KpiGrid, SalesPerformance, PaymentCollection, TopCategories, BranchPerformance,
} from "@/components/buildpos/sections";

export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales — BuildPOS" }, { name: "description", content: "Sales trends, payments, and category performance." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar />
      <KpiGrid />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><SalesPerformance /></div>
        <PaymentCollection />
      </div>
      <TopCategories />
      <BranchPerformance />
    </div>
  ),
});