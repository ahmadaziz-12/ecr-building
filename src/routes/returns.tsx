import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, ReturnsRefunds } from "@/components/buildpos/sections";

export const Route = createFileRoute("/returns")({
  head: () => ({ meta: [{ title: "Returns & Refunds — BuildPOS" }, { name: "description", content: "Standard, damaged, and surplus returns." }] }),
  component: () => (
    <div className="space-y-4">
      <FilterBar compact />
      <ReturnsRefunds />
    </div>
  ),
});