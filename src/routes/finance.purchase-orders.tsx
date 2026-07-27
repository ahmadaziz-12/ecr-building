import { createFileRoute } from "@tanstack/react-router";
import { PurchaseOrdersPage } from "@/components/buildpos/procurement/PurchaseOrdersPage";

export const Route = createFileRoute("/finance/purchase-orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — BuildPOS" }, { name: "description", content: "Purchase Orders module of the BuildPOS building materials retail platform." }] }),
  component: PurchaseOrdersPage,
});
