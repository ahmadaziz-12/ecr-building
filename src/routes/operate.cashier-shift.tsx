import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/operate/cashier-shift")({
  head: () => ({ meta: [{ title: "Cashier Shift — BuildPOS" }, { name: "description", content: "Cashier Shift module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
