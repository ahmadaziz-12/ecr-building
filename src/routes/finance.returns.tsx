import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/finance/returns")({
  head: () => ({ meta: [{ title: "Customer Returns — BuildPOS" }, { name: "description", content: "Customer Returns module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
