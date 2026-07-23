import { createFileRoute } from "@tanstack/react-router";
import { LoyaltyPage } from "@/components/buildpos/pos/LoyaltyPage";

export const Route = createFileRoute("/finance/loyalty")({
  head: () => ({
    meta: [
      { title: "Loyalty Program — BuildPOS" },
      {
        name: "description",
        content: "Loyalty Program module of the BuildPOS building materials retail platform.",
      },
    ],
  }),
  component: LoyaltyPage,
});
