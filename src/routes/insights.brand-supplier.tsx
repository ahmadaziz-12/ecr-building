import { createFileRoute } from "@tanstack/react-router";
import { BrandReportsPage } from "@/components/buildpos/brands/BrandReportsPage";

export const Route = createFileRoute("/insights/brand-supplier")({
  head: () => ({
    meta: [
      { title: "Brand & Supplier Reports — Sales, Preference & Fill Rate" },
      { name: "description", content: "Sales by brand, customer brand preference, product substitution, supplier lead time, fill rate and certificate expiry reporting." },
      { property: "og:title", content: "Brand & Supplier Reports — Sales, Preference & Fill Rate" },
      { property: "og:description", content: "Brand performance and supplier procurement analytics for building materials retail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrandReportsPage,
});