import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/network/terminals")({
  head: () => ({ meta: [{ title: "Terminals — BuildPOS" }, { name: "description", content: "Terminals module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
