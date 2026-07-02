import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/network/branches")({
  head: () => ({ meta: [{ title: "Branches — BuildPOS" }, { name: "description", content: "Branches module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
