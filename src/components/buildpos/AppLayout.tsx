import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Search,
  Bell,
  Wifi,
  Circle,
  Shield,
  ChevronDown,
  ScanBarcode,
  ShoppingBag,
  Users,
  UserSquare2,
  ClipboardList,
  Boxes,
  Package,
  CalendarClock,
  ArrowLeftRight,
  Wallet,
  FileText,
  Percent,
  RotateCcw,
  Receipt,
  Truck,
  Undo2,
  Store,
  MonitorSmartphone,
  Printer,
  BarChart3,
  FileBarChart,
  Target,
  ShieldCheck,
  Layers,
  Sliders,
  UserCog,
  KeyRound,
  Cog,
  ScrollText,
  CreditCard,
  Settings2,
  Blocks,
  Gift,
  Building2,
  UserRound,
  CalendarDays,
  FileSignature,
  Activity,
  ChevronRight,
  Globe,
  RefreshCw,
  Languages,
} from "lucide-react";
import logoAsset from "@/assets/mimony-logo.png.asset.json";
import { statusBar } from "@/lib/buildpos/data";

type Item = { to: string; label: string; icon: typeof LayoutDashboard };
type Group = { name: string; items: Item[]; collapsed?: boolean };

const nav: Group[] = [
  {
    name: "",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    name: "Operate",
    items: [
      { to: "/operate/pos-checkout", label: "POS Checkout", icon: ScanBarcode },
      { to: "/operate/orders", label: "Orders & Quotations", icon: ShoppingBag },
      { to: "/operate/customers", label: "Customers & Contractors", icon: Users },
      { to: "/operate/cashier-workspace", label: "Cashier Workspace", icon: UserSquare2 },
      { to: "/operate/cashier-shift", label: "Cashier Shifts", icon: ClipboardList },
    ],
  },
  {
    name: "Products & Stock",
    items: [
      { to: "/stock/inventory", label: "Product Catalog", icon: Package },
      { to: "/admin/categories", label: "Categories & Attributes", icon: Layers },
      { to: "/stock/stocks", label: "Inventory & Stock", icon: Boxes },
      { to: "/stock/expiry", label: "Material Validity", icon: CalendarClock },
      { to: "/stock/transfers", label: "Stock Transfers", icon: ArrowLeftRight },
      { to: "/coming-soon", label: "Bundles & Systems", icon: Blocks },
    ],
  },
  {
    name: "Procurement",
    items: [
      { to: "/suppliers/suppliers", label: "Suppliers", icon: Truck },
      { to: "/finance/purchase-orders", label: "Purchase Orders", icon: FileText },
      { to: "/suppliers/rts", label: "Supplier Returns", icon: Undo2 },
    ],
  },
  {
    name: "Finance & Customers",
    items: [
      { to: "/finance/expenses", label: "Expenses", icon: Wallet },
      { to: "/finance/pricing", label: "Pricing, Discounts & Coupons", icon: Percent },
      { to: "/finance/returns", label: "Returns & Refunds", icon: RotateCcw },
      { to: "/coming-soon", label: "Loyalty Program", icon: Gift },
      { to: "/finance/tax-zatca", label: "Invoices & Tax Compliance", icon: Receipt },
    ],
  },
  {
    name: "Delivery",
    items: [{ to: "/coming-soon", label: "Delivery & Dispatch", icon: Truck }],
  },
  {
    name: "HRMS",
    items: [
      { to: "/coming-soon", label: "HR Dashboard", icon: LayoutDashboard },
      { to: "/coming-soon", label: "Employees", icon: UserRound },
      { to: "/coming-soon", label: "Departments", icon: Building2 },
      { to: "/coming-soon", label: "Shift & Attendance", icon: CalendarDays },
      { to: "/coming-soon", label: "Leave Management", icon: CalendarClock },
      { to: "/coming-soon", label: "Documents & Contracts", icon: FileSignature },
      { to: "/coming-soon", label: "HR Activity Logs", icon: Activity },
    ],
  },
  {
    name: "Network",
    items: [
      { to: "/network/branches", label: "Branches", icon: Store },
      { to: "/network/terminals", label: "Terminals", icon: MonitorSmartphone },
      { to: "/network/devices", label: "Devices", icon: Printer },
    ],
  },
  {
    name: "Insights",
    items: [
      { to: "/insights/reports", label: "Reports", icon: FileBarChart },
      { to: "/insights/bi", label: "Analytics", icon: BarChart3 },
      { to: "/insights/kpi", label: "KPI Evaluation", icon: Target },
    ],
  },
  {
    name: "Admin",
    items: [
      { to: "/admin/overview", label: "Admin Overview", icon: ShieldCheck },
      { to: "/admin/users", label: "Registered Users", icon: UserCog },
      { to: "/admin/roles", label: "Roles & Permissions", icon: KeyRound },
      { to: "/admin/rules", label: "Rules Engine", icon: Sliders },
      { to: "/admin/pos-settings", label: "POS Settings", icon: Cog },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/admin/plans", label: "Subscriptions", icon: CreditCard },
      { to: "/admin/settings", label: "General Settings", icon: Settings2 },
    ],
  },
];

const allItems: Item[] = nav.flatMap((g) => g.items);

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = allItems.find((m) => m.to === pathname) ?? allItems[0];
  const activeGroup = nav.find((g) => g.items.some((i) => i.to === pathname))?.name ?? "Dashboard";
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(nav.map((g) => [g.name, true]))
  );

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-foreground">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-none flex-col border-r border-black/5 bg-sidebar-bg text-sidebar-fg lg:flex relative">
        <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-60" />
        <div className="relative flex h-16 items-center border-b border-white/10 px-4">
          <div className="flex h-10 w-full items-center justify-center rounded-xl bg-white/95 px-3 shadow-sm">
            <img src={logoAsset.url} alt="Mi Money" className="h-6 w-auto" />
          </div>
        </div>
        <nav className="relative flex-1 space-y-3 overflow-y-auto p-3">
          {nav.map((g) => {
            const isOpen = open[g.name] ?? true;
            if (!g.name) {
              // ungrouped standalone (Dashboard)
              return (
                <ul key="__standalone" className="space-y-0.5">
                  {g.items.map((m) => {
                    const Icon = m.icon;
                    const isActive = pathname === m.to;
                    return (
                      <li key={m.to}>
                        <Link
                          to={m.to}
                          className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition ${
                            isActive
                              ? "bg-white text-brand shadow-sm"
                              : "text-white/85 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-none" />
                          <span className="font-semibold">{m.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              );
            }
            return (
              <div key={g.name}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.name]: !isOpen }))}
                  className="flex w-full items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/70"
                >
                  {g.name}
                  <ChevronDown className={`h-3 w-3 transition ${isOpen ? "" : "-rotate-90"}`} />
                </button>
                {isOpen && (
                  <ul className="mt-1 space-y-0.5">
                    {g.items.map((m) => {
                      const Icon = m.icon;
                      const isActive = pathname === m.to;
                      return (
                        <li key={m.to}>
                          <Link
                            to={m.to}
                            className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition ${
                              isActive
                                ? "bg-white text-brand shadow-sm"
                                : "text-white/75 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <Icon className="h-4 w-4 flex-none" />
                            <span className="font-medium">{m.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
        <div className="relative border-t border-white/10 p-3">
          <div className="rounded-lg bg-white/5 p-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-teal text-teal-foreground font-semibold">
                A
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{statusBar.user}</p>
                <p className="truncate text-white/50">{statusBar.role}</p>
              </div>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"
                title="Profile menu"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
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
            <span className="text-xs text-muted-foreground">{activeGroup}</span>
            <span className="text-muted-foreground">/</span>
            <h1 className="font-display text-base font-semibold text-foreground">{active.label}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search SKU, invoice, customer…"
                className="h-9 w-64 rounded-lg border border-black/10 bg-canvas pl-8 pr-3 text-sm outline-none focus:border-brand"
              />
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success-foreground md:inline-flex">
              <Circle className="h-2 w-2 fill-current" /> {statusBar.shift}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-0.5 text-xs font-medium text-foreground md:inline-flex">
              <Wifi className="h-3 w-3 text-teal" /> {statusBar.sync}
            </span>
            {statusBar.pendingSync > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-[oklch(0.4_0.13_70)] md:inline-flex">
                <RefreshCw className="h-3 w-3" /> {statusBar.pendingSync} pending
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand md:inline-flex">
              <Shield className="h-3 w-3" /> ZATCA {statusBar.zatca}
            </span>
            <button className="hidden h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 text-xs font-medium text-foreground hover:bg-canvas md:inline-flex">
              <Languages className="h-3.5 w-3.5 text-brand" /> {statusBar.language}
            </button>
            <button className="relative grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-foreground hover:bg-canvas">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical" />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90">
              A
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/5 bg-white px-4 py-2 text-[11px] text-muted-foreground md:px-6">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Building2 className="h-3 w-3 text-brand" /> {statusBar.business}
          </span>
          <span className="text-black/20">·</span>
          <span><span className="text-foreground/70">Branch:</span> {statusBar.branch}</span>
          <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand">{statusBar.branchCode}</span>
          <span className="text-black/20">·</span>
          <span><span className="text-foreground/70">Terminal:</span> <span className="font-mono text-foreground">{statusBar.terminal}</span></span>
          <span className="text-black/20">·</span>
          <span><span className="text-foreground/70">User:</span> {statusBar.user} · <span className="text-foreground/60">{statusBar.role}</span></span>
          <span className="text-black/20">·</span>
          <span><span className="text-foreground/70">Date:</span> {statusBar.businessDate}</span>
          <span className="ml-auto flex items-center gap-1 text-foreground/60">
            <Globe className="h-3 w-3" /> {statusBar.currency} · auto-refresh 60s
          </span>
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>

        <footer className="border-t border-black/5 bg-white px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
          BuildPOS · Al Binaa Building Materials Trading · Data source: POS transactions, inventory, cashier shifts, delivery orders, and ZATCA invoice records.
        </footer>
      </div>
    </div>
  );
}