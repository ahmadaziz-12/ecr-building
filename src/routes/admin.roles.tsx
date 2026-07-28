import { createFileRoute } from "@tanstack/react-router";
import { RolesPermissionsPage } from "@/components/buildpos/pos/RolesPermissionsPage";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — BuildPOS" }, { name: "description", content: "Roles & Permissions module of the BuildPOS building materials retail platform." }] }),
  component: RolesPermissionsPage,
});
