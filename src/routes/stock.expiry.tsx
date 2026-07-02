import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/stock/expiry")({
  head: () => ({ meta: [{ title: "Expiry & Material Validity — BuildPOS" }, { name: "description", content: "Expiry & Material Validity module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
