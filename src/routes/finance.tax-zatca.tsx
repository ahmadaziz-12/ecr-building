import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/finance/tax-zatca")({
  head: () => ({ meta: [{ title: "Tax, Fees & ZATCA — BuildPOS" }, { name: "description", content: "Tax, Fees & ZATCA module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
