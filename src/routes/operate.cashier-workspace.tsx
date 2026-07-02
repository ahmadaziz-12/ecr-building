import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/operate/cashier-workspace")({
  head: () => ({ meta: [{ title: "Cashier Workspace — BuildPOS" }, { name: "description", content: "Cashier Workspace module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
