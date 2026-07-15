import { createFileRoute } from "@tanstack/react-router";
import { ZonesPage } from "@/components/delivery/ZonesPage";

export const Route = createFileRoute("/delivery/zones")({
  head: () => ({ meta: [{ title: "Delivery Zones — BuildPOS" }, { name: "description", content: "Delivery zones with distance and fee mapping." }] }),
  component: ZonesPage,
});