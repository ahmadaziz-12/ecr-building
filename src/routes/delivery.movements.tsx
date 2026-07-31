import { createFileRoute } from "@tanstack/react-router";
import { InternalMovementsPage } from "@/components/delivery/InternalMovementsPage";

export const Route = createFileRoute("/delivery/movements")({
  head: () => ({
    meta: [
      { title: "Internal Stock Movements — BuildPOS" },
      { name: "description", content: "Stock location to branch and branch to branch replenishment movements with vehicle and receipt control." },
      { property: "og:title", content: "Internal Stock Movements — BuildPOS" },
      { property: "og:description", content: "Replenishment movements between stock locations and branches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InternalMovementsPage,
});
