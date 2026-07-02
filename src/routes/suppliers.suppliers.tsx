import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/suppliers/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — BuildPOS" }, { name: "description", content: "Suppliers module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
