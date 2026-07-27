import { createFileRoute } from "@tanstack/react-router";
import { ExpiryPage } from "@/components/buildpos/inventory/ExpiryPage";

export const Route = createFileRoute("/stock/expiry")({
  head: () => ({
    meta: [
      { title: "Expiry — BuildPOS" },
      {
        name: "description",
        content:
          "Batch and expiry tracking, split by warehouse and branch, for the BuildPOS building materials retail platform.",
      },
    ],
  }),
  component: ExpiryPage,
});
