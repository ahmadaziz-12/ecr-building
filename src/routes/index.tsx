import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HardHat, Radio, Shield, Truck, Boxes, Wallet, ArrowRight, Lock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logoAsset from "@/assets/mimony-logo.png.asset.json";
import loginHero from "@/assets/login-hero.jpg";
import { useAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const highlights = [
  { icon: Radio, label: "Live command center across 5 KSA branches" },
  { icon: Boxes, label: "Real-time cement, steel, tiles & paint stock" },
  { icon: Truck, label: "Delivery & dispatch yard tracking" },
  { icon: Shield, label: "ZATCA Phase 2 compliant e-invoicing" },
];

function LandingPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [email, setEmail] = useState("owner@ecr-building.local");
  const [password, setPassword] = useState("Passw0rd!");
  const [loading, setLoading] = useState(false);

  // Navigate only once the auth context has actually picked up the new session —
  // calling navigate() immediately after login() raced AuthGate's redirect-to-login
  // effect (context hadn't re-rendered yet) and bounced straight back to "/".
  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter your email and password");
      return;
    }
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      toast.success("Welcome back", { description: `Signed in as ${loggedInUser.name} (${loggedInUser.role})` });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas font-sans text-foreground">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between px-4 md:px-8">
        <div className="flex h-10 items-center rounded-xl bg-white/95 px-3 shadow-sm ring-1 ring-white/40">
          <img src={logoAsset.url} alt="Mi Money" className="h-6 w-auto" />
        </div>
        <Link
          to="/dashboard"
          className="hidden items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/20 md:inline-flex"
        >
          Skip to demo <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <img
            src={loginHero}
            alt="Construction yard at sunset"
            className="absolute inset-0 h-full w-full object-cover"
            width={1536}
            height={1536}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.22_0.08_285)]/95 via-[oklch(0.28_0.10_285)]/80 to-[oklch(0.35_0.13_285)]/60" />
          <div className="absolute inset-0 blueprint-grid-dark opacity-30" />
          <div className="absolute inset-x-0 bottom-0 h-1 hazard-stripe opacity-80" />

          <div className="relative flex h-full flex-col justify-between p-8 pt-24 text-white md:p-12 md:pt-28 lg:p-16 lg:pt-32">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur">
                <HardHat className="h-3 w-3 text-teal" /> BuildPOS · Command Center
              </span>
              <h1 className="mt-5 font-display text-3xl font-bold leading-tight md:text-5xl">
                Run every yard, every truck, every invoice —
                <span className="block text-teal">in one command view.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm text-white/75 md:text-base">
                The industrial POS &amp; operations platform built for building material retailers across Saudi Arabia. Cement, steel, tiles, paint, plumbing — live from counter to warehouse.
              </p>
            </div>

            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {highlights.map((h) => {
                const Icon = h.icon;
                return (
                  <li
                    key={h.label}
                    className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm backdrop-blur"
                  >
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-teal/20 ring-1 ring-teal/40">
                      <Icon className="h-4 w-4 text-teal" />
                    </span>
                    <span className="text-white/85">{h.label}</span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-10 text-[11px] uppercase tracking-[0.2em] text-white/50">
              Mi Money · Riyadh · Jeddah · Dammam · Khobar · Madinah
            </p>
          </div>
        </section>

        {/* Login card */}
        <section className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Sign in</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-foreground">
                Welcome back, Site Manager
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Access live sales, stock yard health and dispatch across your branches.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-[0_10px_30px_-18px_rgba(59,20,120,0.35)]"
            >
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">
                  Work email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-9"
                    placeholder="you@company.sa"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-brand hover:underline"
                    onClick={() => toast.info("Contact your admin to reset your password.")}
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-9"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-black/20 text-brand" />
                Keep me signed in on this terminal
              </label>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Enter Command Center <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Wallet className="h-3 w-3 text-brand" />
                Demo credentials pre-filled — click sign in to explore.
              </div>
            </form>

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              Protected by ZATCA Phase 2 compliant infrastructure · © {new Date().getFullYear()} Mi Money
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
