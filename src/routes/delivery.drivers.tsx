import { createFileRoute } from "@tanstack/react-router";
import { DriversPage } from "@/components/delivery/DriversPage";

export const Route = createFileRoute("/delivery/drivers")({
  head: () => ({ meta: [{ title: "Driver Assignments — BuildPOS" }, { name: "description", content: "Delivery drivers with live availability from HR." }] }),
  component: DriversPage,
});