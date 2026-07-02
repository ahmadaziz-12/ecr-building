import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, ZatcaCompliance, OperationalAlerts } from "@/components/buildpos/sections";

export const Route = createFileRoute("/compliance")({
  head: () => ({ meta: [{ title: "ZATCA & Compliance — BuildPOS" }, { name: "description", content: "VAT, ZATCA submissions, and operational alerts." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <ZatcaCompliance />
      <OperationalAlerts />
    </div>
  ),
});