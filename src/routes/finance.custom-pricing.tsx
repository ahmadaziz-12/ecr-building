import { createFileRoute } from "@tanstack/react-router";
import { CustomPricingPage } from "@/components/buildpos/pricing/CustomPricingPage";

export const Route = createFileRoute("/finance/custom-pricing")({
  head: () => ({
    meta: [
      { title: "Custom Material Pricing & Rate Engine — BuildPOS" },
      { name: "description", content: "Calculate, approve and manage customised rates for cut-to-size, fabricated, tinted, bulk and project building-material orders." },
      { property: "og:title", content: "Custom Material Pricing & Rate Engine — BuildPOS" },
      { property: "og:description", content: "Rate book, configurator, project agreements, supplier special rates and maker-checker approvals for customised building materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomPricingPage,
});