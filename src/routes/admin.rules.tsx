import { createFileRoute } from "@tanstack/react-router";
import { RulesEnginePage } from "@/components/buildpos/rules/RulesEnginePage";

export const Route = createFileRoute("/admin/rules")({
  head: () => ({ meta: [{ title: "Rules Engine — BuildPOS" }, { name: "description", content: "Rules Engine module of the BuildPOS building materials retail platform." }] }),
  component: RulesEnginePage,
});
