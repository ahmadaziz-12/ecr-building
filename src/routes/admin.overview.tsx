import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/overview")({
  head: () => ({ meta: [{ title: "Admin Overview — BuildPOS" }, { name: "description", content: "Admin Overview module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
