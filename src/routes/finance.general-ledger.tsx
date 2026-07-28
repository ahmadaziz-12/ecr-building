import { createFileRoute } from "@tanstack/react-router";
import { GeneralLedgerPage } from "@/components/buildpos/pos/GeneralLedgerPage";

export const Route = createFileRoute("/finance/general-ledger")({
  head: () => ({ meta: [{ title: "General Ledger — BuildPOS" }, { name: "description", content: "General Ledger module of the BuildPOS building materials retail platform." }] }),
  component: GeneralLedgerPage,
});
