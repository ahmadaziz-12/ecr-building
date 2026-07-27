import { createFileRoute } from "@tanstack/react-router";
import { ReportsConsole } from "@/components/buildpos/insights/ReportsConsole";

export const Route = createFileRoute("/insights/reports")({
  head: () => ({ meta: [{ title: "Reports — BuildPOS" }, { name: "description", content: "Operational, financial, returns, VAT and inventory reports — live from transaction data." }] }),
  component: ReportsConsole,
});
