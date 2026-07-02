import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({ meta: [{ title: "Plans & Pricing — BuildPOS" }, { name: "description", content: "Plans & Pricing module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
