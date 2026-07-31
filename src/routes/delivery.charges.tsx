import { createFileRoute } from "@tanstack/react-router";
import { DeliveryChargesPage } from "@/components/delivery/DeliveryChargesPage";

export const Route = createFileRoute("/delivery/charges")({
  head: () => ({
    meta: [
      { title: "Delivery Charges — BuildPOS" },
      { name: "description", content: "Delivery charge matrix by route and coverage area, with a live charge calculator." },
      { property: "og:title", content: "Delivery Charges — BuildPOS" },
      { property: "og:description", content: "Route-based delivery charges, heavy-material fees and free-delivery thresholds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryChargesPage,
});
