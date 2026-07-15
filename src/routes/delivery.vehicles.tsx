import { createFileRoute } from "@tanstack/react-router";
import { VehiclesPage } from "@/components/delivery/VehiclesPage";

export const Route = createFileRoute("/delivery/vehicles")({
  head: () => ({ meta: [{ title: "Vehicle Assignments — BuildPOS" }, { name: "description", content: "Fleet vehicles, capacity and current dispatch." }] }),
  component: VehiclesPage,
});