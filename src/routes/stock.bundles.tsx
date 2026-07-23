import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/bundles")({
  head: () => ({ meta: [{ title: "Bundles & Systems — BuildPOS" }, { name: "description", content: "Bundles & Systems module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
