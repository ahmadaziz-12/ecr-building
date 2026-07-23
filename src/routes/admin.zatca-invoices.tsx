import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/zatca-invoices")({
  head: () => ({ meta: [{ title: "ZATCA Invoices — BuildPOS" }, { name: "description", content: "ZATCA Invoices module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
