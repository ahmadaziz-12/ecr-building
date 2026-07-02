import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, BranchPerformance } from "@/components/buildpos/sections";

export const Route = createFileRoute("/branches")({
  head: () => ({ meta: [{ title: "Branches — BuildPOS" }, { name: "description", content: "Sales performance across Mi Money branches." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <BranchPerformance />
    </div>
  ),
});