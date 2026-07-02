import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/insights/reports")({
  head: () => ({ meta: [{ title: "Reports — BuildPOS" }, { name: "description", content: "Reports module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
