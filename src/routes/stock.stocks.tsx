import { createFileRoute } from "@tanstack/react-router";
import { StockIntakePage } from "@/components/buildpos/stock/StockIntakePage";

export const Route = createFileRoute("/stock/stocks")({
  head: () => ({
    meta: [
      { title: "Inventory & Stock — Add Stock, GRN & Movements" },
      { name: "description", content: "Receive goods, post GRN stock intakes, manage quarantine and track branch stock availability across BuildPOS." },
      { property: "og:title", content: "Inventory & Stock — Add Stock, GRN & Movements" },
      { property: "og:description", content: "Goods receipt, quarantine control and live branch stock balances for building materials retail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockIntakePage,
});
