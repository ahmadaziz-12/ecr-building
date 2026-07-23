import { createFileRoute } from "@tanstack/react-router";
import { PosCheckout } from "@/components/buildpos/PosCheckout";

export const Route = createFileRoute("/operate/pos-checkout")({
  head: () => ({ meta: [{ title: "POS Checkout — BuildPOS" }, { name: "description", content: "Cashier checkout: scan, cart, customer, discount, split payment." }] }),
  component: PosCheckout,
});
