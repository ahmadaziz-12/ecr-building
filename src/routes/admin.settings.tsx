import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — BuildPOS" }, { name: "description", content: "Settings module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
