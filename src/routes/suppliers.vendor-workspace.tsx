import { createFileRoute } from "@tanstack/react-router";
import { VendorWorkspacePage } from "@/components/buildpos/brands/VendorWorkspacePage";

export const Route = createFileRoute("/suppliers/vendor-workspace")({
  head: () => ({
    meta: [
      { title: "Vendor Workspace — Supplier Catalog & Purchase Orders" },
      { name: "description", content: "Restricted supplier-facing workspace: confirm purchase orders, update availability, submit price changes and propose new products for internal approval." },
      { property: "og:title", content: "Vendor Workspace — Supplier Catalog & Purchase Orders" },
      { property: "og:description", content: "Suppliers manage only their own brands, offers, documents and delivery commitments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorWorkspacePage,
});