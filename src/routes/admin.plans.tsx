import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsPage } from "@/components/buildpos/SubscriptionsPage";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({
    meta: [
      { title: "Subscriptions — BuildPOS" },
      { name: "description", content: "Choose the BuildPOS subscription that fits your building-materials retail operation." },
    ],
  }),
  component: SubscriptionsPage,
});