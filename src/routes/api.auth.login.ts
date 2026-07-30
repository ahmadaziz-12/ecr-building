import { createFileRoute } from "@tanstack/react-router";
import { buildDemoUser, checkPassword, findAccount, json, sessionCookie } from "@/lib/api/demo-auth.server";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
        const account = findAccount(body.email ?? "");
        if (!account || !checkPassword(body.password ?? "")) {
          return json({ error: "Incorrect email or password." }, { status: 401 });
        }
        return json(buildDemoUser(account.email), { headers: { "set-cookie": sessionCookie(account.email) } });
      },
    },
  },
});
