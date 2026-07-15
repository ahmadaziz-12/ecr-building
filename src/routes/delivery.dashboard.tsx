import { createFileRoute } from "@tanstack/react-router";
import { DeliveryDashboard } from "@/components/delivery/DeliveryDashboard";

export const Route = createFileRoute("/delivery/dashboard")({
  head: () => ({ meta: [{ title: "Delivery & Dispatch — BuildPOS" }, { name: "description", content: "Monitor pending deliveries, drivers, vehicles and dispatch pipeline across branches." }] }),
  component: DeliveryDashboard,
});