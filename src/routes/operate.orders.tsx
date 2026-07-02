import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/operate/orders")({
  head: () => ({ meta: [{ title: "Orders — BuildPOS" }, { name: "description", content: "Orders module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
