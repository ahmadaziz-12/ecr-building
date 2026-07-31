import { createFileRoute } from "@tanstack/react-router";
import { FleetVehiclesPage } from "@/components/delivery/FleetVehiclesPage";

export const Route = createFileRoute("/delivery/vehicles")({
  head: () => ({ meta: [{ title: "Vehicles — BuildPOS" }, { name: "description", content: "Fleet vehicles, capacity, permitted movement types and document validity." }] }),
  component: FleetVehiclesPage,
});
