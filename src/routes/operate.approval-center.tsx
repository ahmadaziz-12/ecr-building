import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsWorkspace } from "@/components/buildpos/approvals/ApprovalsWorkspace";

export const Route = createFileRoute("/operate/approval-center")({
  head: () => ({ meta: [{ title: "Approval Center — BuildPOS" }, { name: "description", content: "Approval Center module of the BuildPOS building materials retail platform." }] }),
  component: ApprovalsWorkspace,
});
