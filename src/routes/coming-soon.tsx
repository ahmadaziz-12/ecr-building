import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Construction, ArrowRight, HardHat } from "lucide-react";

export const Route = createFileRoute("/coming-soon")({
  head: () => ({
    meta: [
      { title: "Module coming soon — BuildPOS" },
      { name: "description", content: "This BuildPOS module is queued for the next build phase." },
    ],
  }),
  component: ComingSoon,
});

function ComingSoon() {
  // Grab the last hash / referrer label if present — otherwise generic.
  const search = useRouterState({ select: (s) => s.location.search });
  const label = typeof search === "object" && search && "m" in search ? String((search as Record<string, unknown>).m) : "This module";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center text-center">
      <div className="bp-enter relative grid h-20 w-20 place-items-center rounded-2xl bg-brand/10 text-brand">
        <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-40" />
        <Construction className="relative h-9 w-9" />
      </div>
      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[oklch(0.4_0.13_70)]">
        <HardHat className="h-3 w-3" /> Under construction
      </span>
      <h1 className="mt-3 font-display text-2xl font-bold text-foreground md:text-3xl">
        {label} lands in the next phase
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This BuildPOS module is scoped and queued for the next build cycle. Sidebar navigation, filters,
        status bar and dashboard are live now — modules will follow with full dummy data and interactions.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-brand/90"
      >
        Back to Command Center <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}