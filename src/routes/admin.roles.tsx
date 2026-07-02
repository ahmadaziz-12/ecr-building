import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — BuildPOS" }, { name: "description", content: "Roles & Permissions module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
