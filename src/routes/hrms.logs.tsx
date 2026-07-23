import { createFileRoute } from "@tanstack/react-router";
import { HrActivityLogsPage } from "@/components/hr/HrActivityLogsPage";

export const Route = createFileRoute("/hrms/logs")({
  head: () => ({ meta: [{ title: "HR Activity Logs — BuildPOS" }, { name: "description", content: "Complete HR audit trail: employee changes, attendance, leave, documents and contracts." }] }),
  component: HrActivityLogsPage,
});