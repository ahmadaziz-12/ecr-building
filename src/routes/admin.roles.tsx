import { createFileRoute } from "@tanstack/react-router";
import { RolesAccessPage } from "@/components/buildpos/admin/RolesAccessPage";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — BuildPOS" }, { name: "description", content: "Role master, feature-level permission matrix, user access assignments and approval authority for BuildPOS." }] }),
  component: RolesAccessPage,
});
