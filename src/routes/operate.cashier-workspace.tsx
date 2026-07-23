import { createFileRoute } from "@tanstack/react-router";
import { CashierWorkspacePage } from "@/components/buildpos/pos/CashierWorkspacePage";

export const Route = createFileRoute("/operate/cashier-workspace")({
  head: () => ({ meta: [{ title: "Cashier Workspace — BuildPOS" }, { name: "description", content: "Cashier Workspace module of the BuildPOS building materials retail platform." }] }),
  component: CashierWorkspacePage,
});
