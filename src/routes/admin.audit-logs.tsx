import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — BuildPOS" }, { name: "description", content: "Audit Logs module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
