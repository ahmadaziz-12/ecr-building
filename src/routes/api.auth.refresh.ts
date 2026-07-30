import { createFileRoute } from "@tanstack/react-router";
import { buildDemoUser, json, readSession, sessionCookie } from "@/lib/api/demo-auth.server";

export const Route = createFileRoute("/api/auth/refresh")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const email = readSession(request);
        if (!email) return json({ error: "No refresh token." }, { status: 401 });
        return json(buildDemoUser(email), { headers: { "set-cookie": sessionCookie(email) } });
      },
    },
  },
});
