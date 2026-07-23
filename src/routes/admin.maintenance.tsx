import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — BuildPOS" }, { name: "description", content: "Maintenance module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
