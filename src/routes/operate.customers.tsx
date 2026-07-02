import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/operate/customers")({
  head: () => ({ meta: [{ title: "Customers — BuildPOS" }, { name: "description", content: "Customers module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
