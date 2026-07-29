import { createFileRoute } from "@tanstack/react-router";
import { SerialTrackingPage } from "@/components/buildpos/inventory/SerialTrackingPage";

export const Route = createFileRoute("/stock/serial-tracking")({
  head: () => ({ meta: [{ title: "Serial Number Tracking — BuildPOS" }, { name: "description", content: "Serial Number Tracking module of the BuildPOS building materials retail platform." }] }),
  component: SerialTrackingPage,
});
