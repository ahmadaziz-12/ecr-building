import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/finance/pricing")({
  head: () => ({ meta: [{ title: "Coupons & Pricing — BuildPOS" }, { name: "description", content: "Coupons & Pricing module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
