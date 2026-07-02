import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Truck,
  Users,
  Shield,
  RotateCcw,
  Store,
  FileText,
  Settings,
  Search,
  Bell,
  Wifi,
  Circle,
} from "lucide-react";
import logoAsset from "@/assets/mimony-logo.png.asset.json";
import { statusBar } from "@/lib/buildpos/data";

const modules = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: BarChart3 },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/delivery", label: "Delivery", icon: Truck },
  { to: "/cashier", label: "Cashier Activity", icon: Users },
  { to: "/compliance", label: "ZATCA & Compliance", icon: Shield },
  { to: "/returns", label: "Returns & Refunds", icon: RotateCcw },
  { to: "/branches", label: "Branches", icon: Store },
  { to: "/reports", label: "Reports", icon: FileText },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = modules.find((m) => m.to === pathname) ?? modules[0];

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-foreground">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-none flex-col border-r border-black/5 bg-sidebar-bg text-sidebar-fg lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <img src={logoAsset.url} alt="Mi Money" className="h-7 w-auto brightness-0 invert" />
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            BuildPOS Modules
          </p>
          <ul className="space-y-0.5">
            {modules.map((m) => {
              const Icon = m.icon;
              const isActive = pathname === m.to;
              return (
                <li key={m.to}>
                  <Link
                    to={m.to}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-white text-brand shadow-sm"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{m.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
          <div className="mt-3 rounded-lg bg-white/5 p-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-teal text-teal-foreground font-semibold">
                A
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{statusBar.user}</p>
                <p className="truncate text-white/50">{statusBar.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-black/5 bg-white/90 px-4 backdrop-blur md:px-6">
          <div className="lg:hidden">
            <img src={logoAsset.url} alt="Mi Money" className="h-6 w-auto" />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <active.icon className="h-4 w-4 text-brand" />
            <h1 className="font-display text-base font-semibold text-foreground">{active.label}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search SKU, invoice, customer…"
                className="h-9 w-72 rounded-lg border border-black/10 bg-canvas pl-8 pr-3 text-sm outline-none focus:border-brand"
              />
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success-foreground md:inline-flex">
              <Circle className="h-2 w-2 fill-current" /> Shift {statusBar.shift}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-0.5 text-xs font-medium text-foreground md:inline-flex">
              <Wifi className="h-3 w-3 text-teal" /> {statusBar.sync}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand md:inline-flex">
              <Shield className="h-3 w-3" /> ZATCA {statusBar.zatca}
            </span>
            <button className="relative grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-foreground hover:bg-canvas">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical" />
            </button>
          </div>
        </header>

        <div className="border-b border-black/5 bg-white px-4 py-2 text-xs text-muted-foreground md:px-6">
          <span className="text-foreground/70">Branch:</span> {statusBar.branch}
          <span className="mx-2 text-black/20">·</span>
          <span className="text-foreground/70">Terminal:</span> {statusBar.terminal}
          <span className="mx-2 text-black/20">·</span>
          <span className="text-foreground/70">Date:</span> {statusBar.businessDate}
          <span className="mx-2 text-black/20">·</span>
          <span className="text-foreground/70">Currency:</span> {statusBar.currency}
          <span className="ml-auto float-right text-foreground/60">
            Last updated {statusBar.lastUpdated} · auto-refresh 60s
          </span>
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>

        <footer className="border-t border-black/5 bg-white px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
          Data source: POS transactions, inventory, cashier shifts, delivery orders, ZATCA invoice status, and payment records.
        </footer>
      </div>
    </div>
  );
}