import { createFileRoute } from "@tanstack/react-router";
import { StockTakingPage } from "@/components/buildpos/stock/StockTakingPage";

export const Route = createFileRoute("/stock/stock-count")({
  head: () => ({ meta: [{ title: "Stock Taking — BuildPOS" }, { name: "description", content: "Automatic stock taking and reconciliation module of the BuildPOS building materials retail platform." }] }),
  component: StockTakingPage,
});
