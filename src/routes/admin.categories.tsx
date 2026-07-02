import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({ meta: [{ title: "Categories — BuildPOS" }, { name: "description", content: "Categories module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
