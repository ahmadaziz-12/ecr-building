import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  QrCode,
  Fingerprint,
  Warehouse,
  Wrench,
  History,
  BookOpen,
  ClipboardCheck,
  Copy,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BrandLogo } from "@/components/buildpos/BrandLogo";
import { statusBar } from "@/lib/buildpos/data";
import { useFilters, categoryToFilter } from "@/lib/buildpos/filter-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/lib/api/auth";
import { SetPinDialog } from "@/components/buildpos/SetPinDialog";
import { DeliverySync } from "@/lib/api/delivery-sync";
// HRM module temporarily disabled — see the commented-out "HRMS" nav group below.
// import { HrSync } from "@/lib/api/hr-sync";
import { useNotifications } from "@/lib/api/notifications";
import { useProducts } from "@/lib/api/catalog";
import { useCustomers, useCashierShifts, useOrders, useQuotations } from "@/lib/api/pos";

import { useZatcaIdentity } from "@/lib/api/zatca";
import { globalSearch, hasGlobalSearchResults } from "@/lib/buildpos/global-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};
type Group = { name: string; items: Item[]; collapsed?: boolean };

// Every item's `to` route IS its permission module key (see PermissionCatalog.cs on the backend —
// same string on both sides). No separate `module` tag: page-level RBAC means each page's own route
// is the thing being permissioned, not a shared section bucket.
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
      { to: "/operate/approval-center", label: "Approval Center", icon: ShieldCheck },
      // Control Tower is still fully mock/static data with no backend behind it — hidden from
      // nav until it's wired, rather than shipping a dead link (see /operate/control-tower).
      // { to: "/operate/control-tower", label: "Control Tower", icon: Activity },
    ],
  },
  {
    name: "Products & Stock",
    items: [
      { to: "/stock/inventory", label: "Product Catalog", icon: Package },
      { to: "/stock/variant-groups", label: "Variant Groups", icon: Copy },
      { to: "/admin/categories", label: "Categories & Attributes", icon: Layers },
      { to: "/stock/bundles", label: "Bundles & Systems", icon: Blocks },
      { to: "/stock/serial-tracking", label: "Serial Number Tracking", icon: Fingerprint },
    ],
  },
  {
    name: "Stock",
    items: [
      { to: "/stock/warehouses", label: "Warehouse Directory", icon: Warehouse },
      { to: "/stock/stocks", label: "Inventory & Stock", icon: Boxes },
      { to: "/stock/branch-stock", label: "Branch Stock", icon: Store },
      { to: "/stock/stock-count", label: "Stock Taking", icon: ClipboardCheck },
      { to: "/stock/movements", label: "Stock Movements", icon: History },
      { to: "/stock/expiry", label: "Material Validity", icon: CalendarClock },
      { to: "/stock/transfers", label: "Stock Transfers", icon: ArrowLeftRight },
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
      { to: "/finance/general-ledger", label: "General Ledger", icon: BookOpen },
      { to: "/finance/pricing", label: "Pricing, Discounts & Coupons", icon: Percent },
      { to: "/finance/returns", label: "Returns & Refunds", icon: RotateCcw },
      { to: "/finance/loyalty", label: "Loyalty Program", icon: Gift },
      { to: "/finance/tax-zatca", label: "Invoices & Tax Compliance", icon: Receipt },
    ],
  },
  {
    name: "Delivery",
    items: [
      { to: "/delivery/dashboard", label: "Delivery Dashboard", icon: Truck },
      { to: "/delivery/pipeline", label: "Delivery Pipeline", icon: ArrowLeftRight },
      { to: "/delivery/orders", label: "Delivery Orders", icon: ClipboardList },
      { to: "/delivery/drivers", label: "Driver Assignments", icon: UserRound },
      { to: "/delivery/vehicles", label: "Vehicle Assignments", icon: Truck },
      { to: "/delivery/zones", label: "Delivery Zones", icon: Building2 },
      { to: "/delivery/logs", label: "Delivery Activity Logs", icon: Activity },
    ],
  },
  // HRM module temporarily disabled — routes (src/routes/hrms.*.tsx) are commented out too.
  // {
  //   name: "HRMS",
  //   items: [
  //     { to: "/hrms/dashboard", label: "HR Dashboard", icon: LayoutDashboard },
  //     { to: "/hrms/employees", label: "Employees", icon: UserRound },
  //     { to: "/hrms/departments", label: "Departments", icon: Building2 },
  //     { to: "/hrms/attendance", label: "Shift & Attendance", icon: CalendarDays },
  //     { to: "/hrms/leave", label: "Leave Management", icon: CalendarClock },
  //     { to: "/hrms/documents", label: "Documents & Contracts", icon: FileSignature },
  //     { to: "/hrms/logs", label: "HR Activity Logs", icon: Activity },
  //   ],
  // },
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
      { to: "/admin/compliance", label: "Compliance", icon: ShieldCheck },
      { to: "/admin/maintenance", label: "Maintenance", icon: Wrench },
      { to: "/admin/pos-settings", label: "POS Settings", icon: Cog },
      { to: "/admin/zatca-invoices", label: "ZATCA Invoices", icon: QrCode },
      { to: "/admin/zatca-settings", label: "ZATCA Phase 2 Settings", icon: ShieldCheck },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/admin/plans", label: "Subscriptions", icon: CreditCard },
      { to: "/admin/settings", label: "General Settings", icon: Settings2 },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, hasAccess, logout } = useAuth();
  const { setValue: setDashboardFilter, setActiveTab: setDashboardTab } = useFilters();
  const onDashboard = pathname === "/dashboard";

  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const canSearchProducts = hasAccess("/stock/inventory");
  const canSearchCustomers = hasAccess("/operate/customers");
  const canSearchOrders = hasAccess("/operate/orders");
  const searching = search.trim().length > 0;
  const { data: searchProducts } = useProducts(canSearchProducts && searching);
  // On the Dashboard, search only ever surfaces what the Dashboard itself can answer in place
  // (categories/products, via the Category filter + Inventory tab below) — an order, quotation or
  // customer result can only ever be reached by leaving the page, which is exactly what this box
  // should NOT do here. These three simply aren't fetched while on the Dashboard.
  const { data: searchCustomers } = useCustomers(canSearchCustomers && searching && !onDashboard);
  // Orders and quotations are searchable from every OTHER page — an order number is the single most
  // common thing anyone types into a global search box, and leaving it out is what made a valid
  // "ORD-2026-0024" come back as "No matches".
  const { data: searchOrders } = useOrders(canSearchOrders && searching && !onDashboard);
  const { data: searchQuotations } = useQuotations(canSearchOrders && searching && !onDashboard);
  const { data: notifications } = useNotifications();
  const { data: cashierShifts } = useCashierShifts(hasAccess("/operate/cashier-shift"));
  const { data: zatcaIdentity } = useZatcaIdentity(
    user?.branchId ?? null,
    hasAccess("/admin/zatca-settings") && user?.branchId != null,
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const searchResults = useMemo(
    () =>
      globalSearch(search, {
        products: searchProducts,
        // Explicitly dropped (not just left unfetched) so a result set already sitting in the
        // react-query cache from a page visited earlier this session can't leak into the Dashboard's
        // dropdown — `enabled: false` above only skips the fetch, it doesn't hide cached data.
        customers: onDashboard ? undefined : searchCustomers,
        orders: onDashboard ? undefined : searchOrders,
        quotations: onDashboard ? undefined : searchQuotations,
      }),
    [search, searchProducts, searchCustomers, searchOrders, searchQuotations, onDashboard],
  );
  const hasSearchResults = hasGlobalSearchResults(searchResults);

  const openShift = cashierShifts?.find((s) => s.cashierName === user?.name && s.status === "Open");
  const criticalCount = notifications?.filter((n) => n.severity === "Critical").length ?? 0;

  // Navigating with the term in the URL matters: ModulePage seeds its own search/column filters from
  // `?sku=` / `?category=`, so the destination opens already narrowed. Landing on an unfiltered list
  // of thousands of rows is what "the search returns no results" actually looked like.
  function goToSearchResult(to: string, searchParams?: Record<string, string>) {
    navigate({ to, search: searchParams });
    setSearch("");
    setSearchFocused(false);
  }

  // A broad term ("wire") can span several product categories, and the requirement is to answer
  // that IN PLACE — "display all relevant wire categories" — not by bouncing the dashboard reader
  // over to the separate Product Catalog page. This reuses the exact same Category-filter + Inventory
  // tab mechanism the dashboard's own "Top Material Categories" cards already drive (sections.tsx),
  // so a category picked from search and one picked from that grid behave identically.
  function filterDashboardByCategory(categoryName: string, description?: string) {
    const catValue = categoryToFilter(categoryName) ?? categoryName;
    setDashboardFilter("Category", [catValue]);
    setDashboardTab("inventory");
    setSearch("");
    setSearchFocused(false);
    toast.success(`Filtered by ${catValue}`, {
      description: description ?? "Inventory & stock alerts updated.",
    });
  }

  // Used when the matched products don't share one obvious category (or a free-text Enter press
  // has no single category to pick for the reader) — falls back to clearing the filter rather than
  // guessing wrong, so "refine using the options below" stays true.
  function filterDashboardBySearchTerm(term: string) {
    const primaryCategory = searchResults.categories[0]?.name;
    if (primaryCategory) {
      filterDashboardByCategory(primaryCategory);
      return;
    }
    setDashboardFilter("Category", []);
    setDashboardTab("inventory");
    setSearch("");
    setSearchFocused(false);
    toast.info(`No single category matched "${term}"`, {
      description: "Showing full inventory — refine with the Category filter.",
    });
  }

  // Leaving the page clears the box. A term left behind from a previous screen keeps reopening its
  // stale dropdown on the next page, which reads as the search being stuck on an old query.
  useEffect(() => {
    setSearch("");
    setSearchFocused(false);
  }, [pathname]);

  function handleSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const term = search.trim();
    if (!term) return;
    // Orders first: when a term matches an order/quote number it matches nothing else, and jumping
    // to the catalog for it would land on an empty product list.
    if (searchResults.orders.length > 0) goToSearchResult("/operate/orders", { orderNo: term });
    else if (searchResults.quotations.length > 0)
      goToSearchResult("/operate/orders", { quoteNo: term });
    else if (searchResults.products.length > 0 || searchResults.categories.length > 0) {
      // From the Dashboard, a category/product match answers in place — see filterDashboardByCategory
      // — rather than leaving the dashboard for the separate Product Catalog page.
      if (onDashboard) filterDashboardBySearchTerm(term);
      else goToSearchResult("/stock/inventory", { sku: term });
    } else if (searchResults.customers.length > 0) goToSearchResult("/operate/customers");
  }

  const visibleNav = nav
    .map((g) => ({ ...g, items: g.items.filter((i) => hasAccess(i.to)) }))
    .filter((g) => g.items.length > 0);
  const allItems: Item[] = visibleNav.flatMap((g) => g.items);

  const active = allItems.find((m) => m.to === pathname) ?? allItems[0];
  // Exact match first; the prefix fallback keeps a group open on detail routes (e.g.
  // /operate/orders/42) that have no nav entry of their own.
  const activeGroupName =
    visibleNav.find((g) => g.items.some((i) => i.to === pathname))?.name ??
    visibleNav.find((g) => g.items.some((i) => pathname.startsWith(`${i.to}/`)))?.name ??
    "";
  const activeGroup = activeGroupName || "Dashboard";

  // Groups start collapsed; only the one owning the current page is expanded, and navigating to a
  // page in another group collapses the rest. Dashboard is standalone (no group) so landing there
  // leaves every group closed.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpen(activeGroupName ? { [activeGroupName]: true } : {});
  }, [activeGroupName]);

  // Sidebar visibility. Two separate concerns: on desktop the rail collapses to reclaim width (and
  // the choice persists across reloads and pages); on mobile/tablet there is no rail at all, so the
  // same button opens it as an overlay drawer instead. The toggle lives in the app header, which
  // every page renders — it used to exist nowhere, so the sidebar could neither be closed nor
  // reopened, and there was no way to reach navigation below the `lg` breakpoint at all.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("buildpos.sidebar-collapsed") === "1");
    } catch {
      // Private-mode / blocked storage: the sidebar just starts expanded every time.
    }
  }, []);
  function toggleSidebar() {
    // Below `lg` the rail isn't rendered, so the same control drives the overlay drawer.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileNavOpen((v) => !v);
      return;
    }
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("buildpos.sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Persisting the preference is best-effort; the toggle still works for this session.
      }
      return next;
    });
  }
  // Navigating away closes the mobile drawer — otherwise it stays over the page you just opened.
  useEffect(() => setMobileNavOpen(false), [pathname]);

  async function handleLogout() {
    await logout();
    navigate({ to: "/" });
  }

  // Rendered by both the desktop rail and the mobile drawer below, so navigation is identical in
  // either presentation.
  const sidebarInner = (
    <>
      <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-60" />
      <div className="relative flex h-16 items-center gap-2 border-b border-white/10 px-4">
        <div className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-white/95 px-3 shadow-sm">
          <BrandLogo />
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="grid h-8 w-8 flex-none place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <nav className="relative flex-1 space-y-3 overflow-y-auto p-3">
        {visibleNav.map((g) => {
          const isOpen = open[g.name] ?? false;
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
                        className={`flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition ${
                          isActive ? "bg-white text-brand shadow-sm" : "text-white hover:bg-white/5"
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-none" />
                        <span className="min-w-0 truncate font-bold uppercase tracking-wide">
                          {m.label}
                        </span>
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
                onClick={() => setOpen(isOpen ? {} : { [g.name]: true })}
                title={g.name}
                className="flex h-9 w-full items-center justify-between gap-2 px-3 text-start text-[13px] font-bold uppercase tracking-wide text-white hover:text-white"
              >
                <span className="min-w-0 truncate">{g.name}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 flex-none transition ${isOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {isOpen && (
                <ul className="mt-0.5 space-y-0.5 pl-1.5">
                  {g.items.map((m) => {
                    const Icon = m.icon;
                    const isActive = pathname === m.to;
                    return (
                      <li key={m.to}>
                        <Link
                          to={m.to}
                          title={m.label}
                          className={`flex h-8 items-center gap-2.5 rounded-lg px-3 text-[11.5px] transition ${
                            isActive
                              ? "bg-white font-semibold text-brand shadow-sm"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 flex-none" />
                          <span className="min-w-0 truncate font-medium">{m.label}</span>
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
              {(user?.name ?? "?").charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">{user?.name ?? statusBar.user}</p>
              <p className="truncate text-white/50">{user?.role ?? statusBar.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"
              title="Sign out"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-foreground">
      {hasAccess("/delivery/dashboard") && <DeliverySync />}
      {/* HRM module temporarily disabled — see the commented-out "HRMS" nav group below. */}
      {/* {hasAccess("/hrms/dashboard") && <HrSync />} */}

      {/* Sidebar rail (lg and up). */}
      {/* Narrower than the usual 16rem: the reports console renders 20-plus-column tables, and the
          reclaimed 2rem is what keeps them inside their own scroller instead of pushing the page
          itself sideways. */}
      {!sidebarCollapsed && (
        <aside className="sticky top-0 hidden h-screen w-56 flex-none flex-col border-r border-black/5 bg-sidebar-bg text-sidebar-fg lg:flex relative">
          {sidebarInner}
        </aside>
      )}

      {/* Sidebar drawer (below lg). The rail is never rendered at these widths, so without this
          there is no way to navigate at all on a tablet or phone. */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="relative flex h-full w-64 flex-col border-r border-black/5 bg-sidebar-bg text-sidebar-fg shadow-2xl">
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 min-w-0 items-center gap-3 border-b border-black/5 bg-white/90 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-black/10 bg-white text-foreground hover:bg-canvas"
          >
            <Menu className="h-4 w-4 lg:hidden" />
            {sidebarCollapsed ? (
              <PanelLeftOpen className="hidden h-4 w-4 lg:block" />
            ) : (
              <PanelLeftClose className="hidden h-4 w-4 lg:block" />
            )}
          </button>
          <div className="lg:hidden">
            <BrandLogo />
          </div>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <active.icon className="h-4 w-4 text-brand" />
            <span className="truncate text-xs text-muted-foreground">{activeGroup}</span>
            <span className="text-muted-foreground">/</span>
            <h1 className="truncate font-display text-base font-semibold text-foreground">
              {active.label}
            </h1>
          </div>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="relative hidden min-w-0 flex-1 md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={handleSearchEnter}
                placeholder={
                  onDashboard
                    ? "Search products, categories…"
                    : "Search order #, product, category, customer…"
                }
                className="h-9 w-full min-w-0 max-w-64 rounded-lg border border-black/10 bg-canvas pl-8 pr-3 text-sm outline-none focus:border-brand"
              />
              {searchFocused && search.trim() !== "" && (
                <div
                  // Keep focus on the input while a result is being clicked: the blur handler above
                  // tears this panel down on a timer, and losing that race swallowed the click —
                  // the result row highlighted, then nothing happened.
                  onMouseDown={(e) => e.preventDefault()}
                  className="absolute right-0 top-full z-20 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 shadow-lg"
                >
                  {!hasSearchResults && (
                    <p className="px-2.5 py-2 text-xs text-muted-foreground">
                      {!canSearchProducts && onDashboard
                        ? "Search needs access to Product Catalog."
                        : !canSearchProducts && !canSearchCustomers && !canSearchOrders
                          ? "Search needs access to Product Catalog, Orders, or Customers."
                          : `No matches for "${search.trim()}"`}
                    </p>
                  )}
                  {/* Orders lead: an order number is the most common thing typed here, and it
                      matches nothing else, so burying it under the catalog groups is what made a
                      real order look like it didn't exist. */}
                  {searchResults.orders.length > 0 && (
                    <div className="mb-1">
                      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Orders
                      </p>
                      {searchResults.orders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => goToSearchResult("/operate/orders", { orderNo: o.orderNo })}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="truncate font-mono text-xs">{o.orderNo}</span>
                          <span className="ml-2 flex-none truncate text-[10px] text-muted-foreground">
                            {o.customerName} · {o.status}
                          </span>
                        </button>
                      ))}
                      {searchResults.orderTotal > searchResults.orders.length && (
                        <button
                          onClick={() =>
                            goToSearchResult("/operate/orders", { orderNo: search.trim() })
                          }
                          className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-brand hover:bg-canvas"
                        >
                          See all {searchResults.orderTotal} orders matching "{search.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                  {searchResults.quotations.length > 0 && (
                    <div className="mb-1">
                      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Quotations
                      </p>
                      {searchResults.quotations.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => goToSearchResult("/operate/orders", { quoteNo: q.quoteNo })}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="truncate font-mono text-xs">{q.quoteNo}</span>
                          <span className="ml-2 flex-none truncate text-[10px] text-muted-foreground">
                            {q.customerName} · {q.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Categories first: a broad term like "wire" has one useful answer — which kind —
                      and picking one narrows the catalog instead of scrolling every match. */}
                  {searchResults.categories.length > 0 && (
                    <div className="mb-1">
                      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Categories
                      </p>
                      {searchResults.categories.map((c) => (
                        <button
                          key={c.name}
                          onClick={() =>
                            onDashboard
                              ? filterDashboardByCategory(c.name)
                              : goToSearchResult("/stock/inventory", { category: c.name })
                          }
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                            {c.count} SKU{c.count === 1 ? "" : "s"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.products.length > 0 && (
                    <div className="mb-1">
                      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Products
                      </p>
                      {searchResults.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            onDashboard
                              ? filterDashboardByCategory(
                                  p.categoryName ?? "Uncategorized",
                                  `Look for ${p.nameEn} (${p.sku}) in Inventory Health below.`,
                                )
                              : goToSearchResult("/stock/inventory", { sku: p.sku })
                          }
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="truncate">{p.nameEn}</span>
                          <span className="ml-2 flex-none font-mono text-[10px] text-muted-foreground">
                            {p.sku}
                          </span>
                        </button>
                      ))}
                      {searchResults.productTotal > searchResults.products.length && (
                        <button
                          onClick={() =>
                            onDashboard
                              ? filterDashboardBySearchTerm(search.trim())
                              : goToSearchResult("/stock/inventory", { sku: search.trim() })
                          }
                          className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-brand hover:bg-canvas"
                        >
                          See all {searchResults.productTotal} products matching "{search.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                  {searchResults.customers.length > 0 && (
                    <div>
                      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Customers
                      </p>
                      {searchResults.customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goToSearchResult("/operate/customers")}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="truncate">{c.nameEn}</span>
                          <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                            {c.phone ?? "—"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {hasAccess("/operate/cashier-shift") && (
              <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-success-foreground xl:inline-flex">
                <Circle className="h-2 w-2 fill-current" />{" "}
                {openShift
                  ? `Open since ${new Date(openShift.openedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                  : "No active shift"}
              </span>
            )}
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap xl:inline-flex ${online ? "border-teal/30 bg-teal/10 text-foreground" : "border-critical/30 bg-critical/10 text-critical"}`}
            >
              <Wifi className={`h-3 w-3 ${online ? "text-teal" : "text-critical"}`} />{" "}
              {online ? "Online" : "Offline"}
            </span>
            {hasAccess("/admin/zatca-settings") && (
              <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-brand xl:inline-flex">
                <Shield className="h-3 w-3" /> ZATCA{" "}
                {zatcaIdentity?.onboardingStatus === "ProductionReady"
                  ? "Connected"
                  : zatcaIdentity
                    ? "Pending"
                    : "—"}
              </span>
            )}
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative grid h-9 w-9 flex-none place-items-center rounded-lg border border-black/10 bg-white text-foreground hover:bg-canvas">
                  <Bell className="h-4 w-4" />
                  {notifications && notifications.length > 0 && (
                    <span
                      className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${criticalCount > 0 ? "bg-critical" : "bg-warning"}`}
                    />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(!notifications || notifications.length === 0) && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No alerts right now.
                  </p>
                )}
                {notifications?.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => n.link && navigate({ to: n.link })}
                    className="flex items-start gap-2 py-2"
                  >
                    <span
                      className={`mt-1 h-1.5 w-1.5 flex-none rounded-full ${
                        n.severity === "Critical"
                          ? "bg-critical"
                          : n.severity === "Warning"
                            ? "bg-warning"
                            : "bg-brand"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{n.message}</span>
                      <span className="block text-[10px] text-muted-foreground">{n.type}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90">
                  {(user?.name ?? "?").charAt(0)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user?.name ?? "—"}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email ?? ""}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.role ?? ""}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* BRD §10.2: self-service PIN for register sign-in / idle unlock / authorizations. */}
                <DropdownMenuItem onClick={() => setPinDialogOpen(true)}>Set PIN…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-critical focus:text-critical"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SetPinDialog open={pinDialogOpen} onOpenChange={setPinDialogOpen} />
          </div>
        </header>

        {/* min-w-0 lets a wide child (a report table) shrink to the column and scroll inside its own
            overflow-x-auto box; without it the flex item sizes to its content and the whole page
            gains a horizontal scrollbar. */}
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>

        <footer className="border-t border-black/5 bg-white px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
          BuildPOS · Al Binaa Building Materials Trading · Data source: POS transactions, inventory,
          cashier shifts, delivery orders, and ZATCA invoice records.
        </footer>
      </div>
    </div>
  );
}
