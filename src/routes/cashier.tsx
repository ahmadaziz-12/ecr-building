import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, CashierActivity } from "@/components/buildpos/sections";

export const Route = createFileRoute("/cashier")({
  head: () => ({ meta: [{ title: "Cashier Activity — BuildPOS" }, { name: "description", content: "Terminal activity, cashier shifts, and cash variance." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <CashierActivity />
    </div>
  ),
});