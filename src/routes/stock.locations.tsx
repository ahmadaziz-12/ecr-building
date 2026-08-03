import { createFileRoute } from "@tanstack/react-router";
import { StockLocationsPage } from "@/components/buildpos/stock/StockLocationsPage";

export const Route = createFileRoute("/stock/locations")({
  head: () => ({
    meta: [
      { title: "Stock Locations — BuildPOS" },
      { name: "description", content: "Manage stock locations, zones, aisles, racks and bins across branches in BuildPOS." },
      { property: "og:title", content: "Stock Locations — BuildPOS" },
      { property: "og:description", content: "Location hierarchy and stock eligibility for every branch balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockLocationsPage,
});
