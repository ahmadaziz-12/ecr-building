import { createFileRoute } from "@tanstack/react-router";
import { AttendancePage } from "@/components/hr/AttendancePage";

export const Route = createFileRoute("/hrms/attendance")({
  head: () => ({ meta: [{ title: "Shift & Attendance — BuildPOS" }, { name: "description", content: "Shift templates, employee shifts, check-in/out, adjustments and overtime." }] }),
  component: AttendancePage,
});