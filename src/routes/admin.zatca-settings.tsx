import { createFileRoute } from "@tanstack/react-router";
import { ZatcaSettingsPage } from "@/components/buildpos/ZatcaSettingsPage";

export const Route = createFileRoute("/admin/zatca-settings")({
  head: () => ({ meta: [{ title: "ZATCA Phase 2 Settings — BuildPOS" }, { name: "description", content: "ZATCA Phase 2 Settings module of the BuildPOS building materials retail platform." }] }),
  component: ZatcaSettingsPage,
});
