import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/buildpos/ModulePage";

export const Route = createFileRoute("/network/devices")({
  head: () => ({ meta: [{ title: "Devices — BuildPOS" }, { name: "description", content: "Devices module of the BuildPOS building materials retail platform." }] }),
  component: ModulePage,
});
