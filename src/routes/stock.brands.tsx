import { createFileRoute } from "@tanstack/react-router";
import { BrandMasterPage } from "@/components/buildpos/brands/BrandMasterPage";

export const Route = createFileRoute("/stock/brands")({
  head: () => ({
    meta: [
      { title: "Brand Master — Brands, Suppliers & Categories" },
      { name: "description", content: "Create building-material brands, approve them per category and map authorized suppliers with their own costs, lead times and terms." },
      { property: "og:title", content: "Brand Master — Brands, Suppliers & Categories" },
      { property: "og:description", content: "Brand master data plus supplier-brand-category agreements for building materials retail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrandMasterPage,
});