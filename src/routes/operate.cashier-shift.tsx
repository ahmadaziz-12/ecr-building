import { createFileRoute } from "@tanstack/react-router";
import { CashierShiftPage } from "@/components/buildpos/pos/CashierShiftPage";

export const Route = createFileRoute("/operate/cashier-shift")({
  head: () => ({ meta: [{ title: "Cashier Shift — BuildPOS" }, { name: "description", content: "Cashier Shift module of the BuildPOS building materials retail platform." }] }),
  component: CashierShiftPage,
});
