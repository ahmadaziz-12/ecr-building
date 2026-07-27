import { createFileRoute } from "@tanstack/react-router";
import { StockCountConsole } from "@/components/buildpos/inventory/StockCountConsole";

export const Route = createFileRoute("/stock/stock-count")({
  head: () => ({ meta: [{ title: "Stock Count — BuildPOS" }, { name: "description", content: "Automatic stock counting and stocktake reconciliation module of the BuildPOS building materials retail platform." }] }),
  component: StockCountConsole,
});
