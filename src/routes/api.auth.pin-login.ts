import { createFileRoute } from "@tanstack/react-router";
import { buildDemoUser, checkPin, findAccount, json, sessionCookie } from "@/lib/api/demo-auth.server";

export const Route = createFileRoute("/api/auth/pin-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { email?: string; pin?: string };
        const account = findAccount(body.email ?? "");
        if (!account || !checkPin(account.email, body.pin ?? "")) {
          return json({ error: "Incorrect PIN." }, { status: 401 });
        }
        return json(buildDemoUser(account.email), { headers: { "set-cookie": sessionCookie(account.email) } });
      },
    },
  },
});
