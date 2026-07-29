import { createFileRoute } from "@tanstack/react-router";
import { ApprovalCenterPage } from "@/components/buildpos/pos/ApprovalCenterPage";

export const Route = createFileRoute("/operate/approval-center")({
  head: () => ({ meta: [{ title: "Approval Center — BuildPOS" }, { name: "description", content: "Approval Center module of the BuildPOS building materials retail platform." }] }),
  component: ApprovalCenterPage,
});
