import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, DeliveryQueue } from "@/components/buildpos/sections";

export const Route = createFileRoute("/delivery")({
  head: () => ({ meta: [{ title: "Delivery — BuildPOS" }, { name: "description", content: "Dispatch queue and delivery order status." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <DeliveryQueue />
    </div>
  ),
});