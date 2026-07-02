import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/rules")({
  head: () => ({ meta: [{ title: "Rules Engine — BuildPOS" }, { name: "description", content: "Rules Engine module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
