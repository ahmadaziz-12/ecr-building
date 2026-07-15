import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPipeline } from "@/components/delivery/DeliveryPipeline";

export const Route = createFileRoute("/delivery/pipeline")({
  head: () => ({ meta: [{ title: "Delivery Pipeline — BuildPOS" }, { name: "description", content: "Drag delivery orders through Pending → Delivered with validated stage transitions." }] }),
  component: DeliveryPipeline,
});