import { createFileRoute } from "@tanstack/react-router";
import { DeliveryOrdersPage } from "@/components/delivery/DeliveryOrdersPage";

export const Route = createFileRoute("/delivery/orders")({
  head: () => ({ meta: [{ title: "Delivery Orders — BuildPOS" }, { name: "description", content: "All delivery orders with status, driver, vehicle and value." }] }),
  component: DeliveryOrdersPage,
});