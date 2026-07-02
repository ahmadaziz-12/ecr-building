import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/insights/bi")({
  head: () => ({ meta: [{ title: "Business Intelligence — BuildPOS" }, { name: "description", content: "Business Intelligence module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
