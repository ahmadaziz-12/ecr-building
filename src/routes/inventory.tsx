import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, InventoryHealth, TopCategories } from "@/components/buildpos/sections";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — BuildPOS" }, { name: "description", content: "Stock health, low-stock alerts, and category availability." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <InventoryHealth />
      <TopCategories />
    </div>
  ),
});