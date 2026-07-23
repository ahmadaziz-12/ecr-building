import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Registered Users — BuildPOS" }, { name: "description", content: "Registered Users module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
