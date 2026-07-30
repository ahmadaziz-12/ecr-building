import { createFileRoute } from "@tanstack/react-router";
import { clearedCookie } from "@/lib/api/demo-auth.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: () => new Response(null, { status: 204, headers: { "set-cookie": clearedCookie() } }),
    },
  },
});
