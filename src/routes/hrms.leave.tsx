import { createFileRoute } from "@tanstack/react-router";
import { LeavePage } from "@/components/hr/LeavePage";

export const Route = createFileRoute("/hrms/leave")({
  head: () => ({ meta: [{ title: "Leave Management — BuildPOS" }, { name: "description", content: "Submit, approve and track employee leave. Approved leave updates attendance and driver availability." }] }),
  component: LeavePage,
});