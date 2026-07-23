import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/components/buildpos/pos/OrdersPage";

export const Route = createFileRoute("/operate/orders")({
  head: () => ({ meta: [{ title: "Orders — BuildPOS" }, { name: "description", content: "Orders module of the BuildPOS building materials retail platform." }] }),
  component: OrdersPage,
});
