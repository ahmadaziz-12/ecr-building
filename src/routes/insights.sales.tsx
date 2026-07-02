import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/insights/sales")({
  head: () => ({ meta: [{ title: "Sales Analytics — BuildPOS" }, { name: "description", content: "Sales Analytics module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
