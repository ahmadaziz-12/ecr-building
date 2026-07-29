import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/variant-groups")({
  head: () => ({ meta: [{ title: "Variant Groups — BuildPOS" }, { name: "description", content: "Product Variants module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
