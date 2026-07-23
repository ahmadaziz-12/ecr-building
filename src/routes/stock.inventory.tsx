import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/inventory")({
  head: () => ({ meta: [{ title: "Inventory — BuildPOS" }, { name: "description", content: "Inventory module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
