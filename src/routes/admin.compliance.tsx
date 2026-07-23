import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/admin/compliance")({
  head: () => ({ meta: [{ title: "Compliance — BuildPOS" }, { name: "description", content: "Compliance module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
