import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/transfers")({
  head: () => ({ meta: [{ title: "Stock Transfers — BuildPOS" }, { name: "description", content: "Stock Transfers module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
