import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/insights/kpi")({
  head: () => ({ meta: [{ title: "KPI Evaluation — BuildPOS" }, { name: "description", content: "KPI Evaluation module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
