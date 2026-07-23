import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/components/buildpos/pos/CustomersPage";

export const Route = createFileRoute("/operate/customers")({
  head: () => ({ meta: [{ title: "Customers — BuildPOS" }, { name: "description", content: "Customers module of the BuildPOS building materials retail platform." }] }),
  component: CustomersPage,
});
