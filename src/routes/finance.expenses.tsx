import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/finance/expenses")({
  head: () => ({ meta: [{ title: "Expenses — BuildPOS" }, { name: "description", content: "Expenses module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
