import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/warehouses")({
  head: () => ({ meta: [{ title: "Warehouses — BuildPOS" }, { name: "description", content: "Warehouses module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
