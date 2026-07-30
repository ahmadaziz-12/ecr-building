import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck, Check, Crown, Rocket, Shield, Sparkles, Store, Users, Zap,
  Building2, Boxes, HeadphonesIcon, CreditCard, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api/client";
import { useSubscription } from "@/lib/api/admin";
import starter from "@/assets/plans/starter.jpg";
import growth from "@/assets/plans/growth.jpg";
import business from "@/assets/plans/business.jpg";
import enterprise from "@/assets/plans/enterprise.jpg";
import { SARIcon } from "@/lib/buildpos/currency";
import { CurrencyText } from "@/lib/buildpos/currency";

type Plan = {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  image: string;
  icon: typeof Rocket;
  accent: string;
  badge?: string;
  highlights: { icon: typeof Store; label: string; value: string }[];
  features: string[];
  cta: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Single store, single terminal — clean POS with ZATCA e-invoicing.",
    monthly: 249,
    yearly: 199,
    image: starter,
    icon: Rocket,
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
    highlights: [
      { icon: Store, label: "Branches", value: "1" },
      { icon: CreditCard, label: "Terminals", value: "1" },
      { icon: Users, label: "Users", value: "3" },
      { icon: Boxes, label: "SKUs", value: "1,500" },
    ],
    features: [
      "Cash & Mada payments",
      "ZATCA Phase 2 e-invoicing",
      "Inventory & barcode scanning",
      "Basic reports & X/Z shift reports",
      "Email support",
    ],
    cta: "Start free trial",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Multi-terminal store with contractor accounts and delivery flow.",
    monthly: 549,
    yearly: 449,
    image: growth,
    icon: Sparkles,
    accent: "from-brand/25 via-brand/5 to-transparent",
    badge: "Most Popular",
    featured: true,
    highlights: [
      { icon: Store, label: "Branches", value: "1" },
      { icon: CreditCard, label: "Terminals", value: "5" },
      { icon: Users, label: "Users", value: "15" },
      { icon: Boxes, label: "SKUs", value: "10,000" },
    ],
    features: [
      "Everything in Starter",
      "Contractor / B2B accounts + credit limits",
      "Delivery orders & driver handover",
      "Purchase orders & supplier returns",
      "Custom price lists & discount rules",
      "Priority chat support",
    ],
    cta: "Upgrade to Growth",
  },
  {
    id: "business",
    name: "Business",
    tagline: "Multi-branch chains with warehouses, transfers and analytics.",
    monthly: 1149,
    yearly: 949,
    image: business,
    icon: Building2,
    accent: "from-teal/25 via-teal/5 to-transparent",
    highlights: [
      { icon: Store, label: "Branches", value: "10" },
      { icon: CreditCard, label: "Terminals", value: "40" },
      { icon: Users, label: "Users", value: "100" },
      { icon: Boxes, label: "SKUs", value: "Unlimited" },
    ],
    features: [
      "Everything in Growth",
      "Central warehouse & stock transfers",
      "Material validity & batch tracking",
      "Rules engine (approvals, discounts, credit)",
      "Analytics & KPI dashboards",
      "Role-based permissions",
      "API access & webhooks",
    ],
    cta: "Talk to sales",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "National operators — dedicated infra, SLA, and integrations.",
    monthly: 0,
    yearly: 0,
    image: enterprise,
    icon: Crown,
    accent: "from-indigo-500/25 via-indigo-500/5 to-transparent",
    highlights: [
      { icon: Store, label: "Branches", value: "Unlimited" },
      { icon: CreditCard, label: "Terminals", value: "Unlimited" },
      { icon: Users, label: "Users", value: "Unlimited" },
      { icon: Shield, label: "SLA", value: "99.95%" },
    ],
    features: [
      "Everything in Business",
      "Dedicated cloud region & backups",
      "SSO / SCIM, custom roles",
      "Custom ERP / accounting integrations",
      "24×7 phone support + on-site training",
      "Named customer success manager",
      "Custom SLA & security review",
    ],
    cta: "Contact sales",
  },
];

const addons = [
  { icon: Zap, name: "Extra Terminal", price: "49 ر.س", per: "/terminal/mo", desc: "Add another POS lane to any plan." },
  { icon: Building2, name: "Extra Branch", price: "199 ر.س", per: "/branch/mo", desc: "Roll out a new location with pre-configured stock." },
  { icon: HeadphonesIcon, name: "Premium Support", price: "399 ر.س", per: "/mo", desc: "1-hour response SLA, direct WhatsApp line to engineers." },
  { icon: Shield, name: "Advanced Compliance", price: "299 ر.س", per: "/mo", desc: "Audit exports, custom retention & fine-grained logs." },
];

// GET /api/admin/plans — src/lib/api/admin.ts has no plans-list hook (only useSubscription), so
// the query lives here. yearlyPrice is a full-year total; the cards display a per-month rate.
type PlanDto = {
  id: number; name: string; monthlyPrice: number; yearlyPrice: number;
  maxBranches: number; maxTerminals: number; maxUsers: number; maxSkus: number;
  features: string[]; status: string;
};
const usePlans = () => useQuery({ queryKey: ["admin", "plans"], queryFn: () => apiGet<PlanDto[]>("/api/admin/plans") });

// No real payment gateway is wired up (Admin Overview's own health check reports the payment
// gateway as "Simulated") — faking a successful charge/plan-change here would be dishonest, so a
// plan or add-on request opens a real, pre-filled lead email instead of silently no-opping.
function sendLeadEmail(subject: string, planName: string) {
  const body = `Hi team,\n\nWe'd like to talk about the ${planName} plan for our BuildPOS workspace.\n\nThanks`;
  window.location.href = `mailto:sales@buildpos.example?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SubscriptionsPage() {
  const [yearly, setYearly] = useState(true);
  const [selected, setSelected] = useState<string>("growth");
  const { data: livePlans } = usePlans();
  const { data: subscription } = useSubscription();

  // "growth" above is just a render-before-data placeholder — sync to the tenant's REAL plan the
  // first time it loads (this tenant is actually on Business, not Growth), without fighting the
  // user's own clicks afterward if they're previewing other cards.
  const syncedRealPlan = useRef(false);
  useEffect(() => {
    if (syncedRealPlan.current || !subscription) return;
    syncedRealPlan.current = true;
    setSelected(subscription.planName.toLowerCase());
  }, [subscription]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-sidebar-bg p-6 text-white md:p-10">
        <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-40" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl bp-float" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal/40 blur-3xl bp-float-slow" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Admin · Subscriptions</p>
            <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
              Pick the BuildPOS plan that fits your yard.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              From a single tile counter to a national network of building-materials
              yards — every plan ships with ZATCA e-invoicing, offline POS and Arabic-first UX.
            </p>
            <div className="mt-5 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1 text-xs">
              <button
                onClick={() => setYearly(false)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  !yearly ? "bg-white text-brand" : "text-white/70 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition ${
                  yearly ? "bg-white text-brand" : "text-white/70 hover:text-white"
                }`}
              >
                Yearly
                <span className="rounded-full bg-success/25 px-1.5 py-0.5 text-[10px] font-bold text-success">Save 20%</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <BadgeCheck className="h-4 w-4 text-teal" />
            <div>
              <p className="font-semibold">Your workspace</p>
              <p className="text-xs text-white/60">
                Al Binaa Building Materials
                {subscription
                  ? ` · ${subscription.planName} plan · Renews ${new Date(subscription.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                  : " · Loading subscription…"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="ui-card-grid">
        {plans.map((p) => {
          const Icon = p.icon;
          // Real per-plan pricing from GET /api/admin/plans (matched by name); the static numbers
          // only show while the query loads. Live yearlyPrice is per-year, shown as a monthly rate.
          const livePlan = livePlans?.find((lp) => lp.name.toLowerCase() === p.id);
          const price = livePlan
            ? yearly ? Math.round(livePlan.yearlyPrice / 12) : livePlan.monthlyPrice
            : yearly ? p.yearly : p.monthly;
          const isSelected = selected === p.id;
          return (
            <div
              key={p.id}
              className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white shadow-[0_4px_16px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,10,50,0.08)] ${
                p.featured ? "border-brand/40 ring-2 ring-brand/15" : "border-black/5"
              }`}
            >
              {p.badge && (
                <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-foreground shadow">
                  <Sparkles className="h-3 w-3" /> {p.badge}
                </span>
              )}
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={p.image}
                  alt=""
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${p.accent}`} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/95 shadow">
                    <Icon className="h-4 w-4 text-brand" />
                  </div>
                  <div className="text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Plan</p>
                    <p className="font-display text-lg font-bold leading-tight">{p.name}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <p className="text-sm text-muted-foreground">{p.tagline}</p>

                <div className="mt-4 flex items-baseline gap-1.5">
                  {price === 0 ? (
                    <span className="font-display text-2xl font-bold text-foreground">Custom</span>
                  ) : (
                    <>
                      <span className="font-display text-3xl font-bold text-foreground">{price}</span>
                      <span className="text-sm font-medium text-muted-foreground"><SARIcon /> / mo</span>
                    </>
                  )}
                  {yearly && price > 0 && (
                    <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.35_0.1_155)]">
                      billed yearly
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {p.highlights.map((h) => {
                    const HIcon = h.icon;
                    return (
                      <div key={h.label} className="rounded-lg border border-black/5 bg-canvas p-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <HIcon className="h-3 w-3 text-brand" /> {h.label}
                        </div>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{h.value}</p>
                      </div>
                    );
                  })}
                </div>

                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-foreground/85">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      setSelected(p.id);
                      if (!isSelected) sendLeadEmail(p.cta, p.name);
                    }}
                    className={`w-full gap-1.5 ${
                      p.featured
                        ? "bg-brand text-brand-foreground hover:bg-brand/90"
                        : "bg-foreground text-white hover:bg-foreground/90"
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4" /> Current selection
                      </>
                    ) : (
                      <>
                        {p.cta} <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    14-day trial · Cancel any time
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add-ons */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Add-ons</p>
            <h2 className="font-display text-xl font-bold text-foreground">Extend any plan</h2>
          </div>
          <p className="text-xs text-muted-foreground">Attach or remove from your subscription any time.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {addons.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.name} className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
                <div className="flex items-start justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-bold text-foreground"><CurrencyText value={a.price} /></p>
                    <p className="text-[10px] text-muted-foreground">{a.per}</p>
                  </div>
                </div>
                <p className="mt-3 font-semibold text-foreground">{a.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.desc}</p>
                <button
                  onClick={() => { sendLeadEmail(`Add-on request: ${a.name}`, a.name); toast.success(`Request drafted for ${a.name} — check your email client.`); }}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  Add to subscription <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer note */}
      <div className="rounded-2xl border border-black/5 bg-white p-5 text-sm text-muted-foreground shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <Shield className="h-4 w-4 text-teal" />
          <span className="text-foreground">Prices exclude 15% VAT.</span>
          <span>All plans include ZATCA Phase 2 e-invoicing, offline POS, Arabic/English UX, and daily encrypted backups.</span>
        </div>
      </div>
    </div>
  );
}