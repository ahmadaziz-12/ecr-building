import { createFileRoute } from "@tanstack/react-router";
import { DepartmentsPage } from "@/components/hr/DepartmentsPage";

export const Route = createFileRoute("/hrms/departments")({
  head: () => ({ meta: [{ title: "Departments — BuildPOS" }, { name: "description", content: "Departments, managers and branch scope." }] }),
  component: DepartmentsPage,
});