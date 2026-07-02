import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/operate/control-tower")({
  head: () => ({ meta: [{ title: "Control Tower — BuildPOS" }, { name: "description", content: "Control Tower module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
