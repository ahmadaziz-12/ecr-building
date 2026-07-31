import { createFileRoute } from "@tanstack/react-router";
import { CustomerViewPage } from "@/components/buildpos/brands/CustomerViewPage";

export const Route = createFileRoute("/operate/customer-view")({
  head: () => ({
    meta: [
      { title: "Customer View — Compare Building Material Brands" },
      { name: "description", content: "Assisted in-store brand discovery: browse category, subcategory and specification, compare up to four brands and add the chosen SKU to the cart." },
      { property: "og:title", content: "Customer View — Compare Building Material Brands" },
      { property: "og:description", content: "Brand comparison, stock availability and delivery options for walk-in and contractor customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomerViewPage,
});