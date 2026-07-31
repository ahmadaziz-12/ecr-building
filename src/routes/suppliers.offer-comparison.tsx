import { createFileRoute } from "@tanstack/react-router";
import { SupplierOfferComparisonPage } from "@/components/buildpos/brands/SupplierOfferComparisonPage";

export const Route = createFileRoute("/suppliers/offer-comparison")({
  head: () => ({
    meta: [
      { title: "Supplier Offer Comparison — Cost, Lead Time & Fill Rate" },
      { name: "description", content: "Internal procurement screen comparing approved supplier offers for the same brand and SKU by cost, MOQ, lead time, availability and fill rate." },
      { property: "og:title", content: "Supplier Offer Comparison — Cost, Lead Time & Fill Rate" },
      { property: "og:description", content: "Compare approved supplier offers and draft a purchase order with the best terms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupplierOfferComparisonPage,
});