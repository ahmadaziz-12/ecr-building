import { createFileRoute } from "@tanstack/react-router";
import { DeliveryLogsPage } from "@/components/delivery/ActivityLogsPage";

export const Route = createFileRoute("/delivery/logs")({
  head: () => ({ meta: [{ title: "Delivery Activity Logs — BuildPOS" }, { name: "description", content: "Full audit trail of delivery stage transitions and outcomes." }] }),
  component: DeliveryLogsPage,
});