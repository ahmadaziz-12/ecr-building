import { createFileRoute } from "@tanstack/react-router";
import { CustomerDisplayPage } from "@/components/buildpos/pos/CustomerDisplayPage";

export const Route = createFileRoute("/operate/customer-display")({
  head: () => ({ meta: [{ title: "Customer Display — BuildPOS" }, { name: "description", content: "Fullscreen customer-facing mirror of the current sale." }] }),
  component: CustomerDisplayPage,
});
