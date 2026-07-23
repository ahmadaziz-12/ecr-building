import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/stocks")({
  head: () => ({ meta: [{ title: "Stocks — BuildPOS" }, { name: "description", content: "Stocks module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
