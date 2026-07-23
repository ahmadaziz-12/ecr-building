import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/pos-settings")({
  head: () => ({ meta: [{ title: "POS Settings — BuildPOS" }, { name: "description", content: "POS Settings module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
