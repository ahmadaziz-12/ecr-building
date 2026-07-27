import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/movements")({
  head: () => ({ meta: [{ title: "Stock Movements — BuildPOS" }, { name: "description", content: "Stock movement ledger module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
