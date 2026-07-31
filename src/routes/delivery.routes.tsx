import { createFileRoute } from "@tanstack/react-router";
import { DeliveryRoutesPage } from "@/components/delivery/RoutesPage";

export const Route = createFileRoute("/delivery/routes")({
  head: () => ({
    meta: [
      { title: "Delivery Coverage & Routes — BuildPOS" },
      { name: "description", content: "Define source-to-destination delivery routes, coverage areas, permitted vehicles and charges." },
      { property: "og:title", content: "Delivery Coverage & Routes — BuildPOS" },
      { property: "og:description", content: "Source-to-destination routes, coverage areas, vehicle eligibility and delivery charges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryRoutesPage,
});
