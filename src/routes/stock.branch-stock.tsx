import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/branch-stock")({
  head: () => ({ meta: [{ title: "Branch Stock — BuildPOS" }, { name: "description", content: "Branch shop-floor stock module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
