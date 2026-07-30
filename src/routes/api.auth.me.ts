import { createFileRoute } from "@tanstack/react-router";
import { buildDemoUser, json, readSession } from "@/lib/api/demo-auth.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const email = readSession(request);
        if (!email) return json({ error: "Unauthorized" }, { status: 401 });
        return json(buildDemoUser(email));
      },
    },
  },
});
