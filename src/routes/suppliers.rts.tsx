import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/suppliers/rts")({
  head: () => ({ meta: [{ title: "Supplier Returns — BuildPOS" }, { name: "description", content: "Supplier Returns module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
