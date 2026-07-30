// Preview-only demo auth. The real authentication lives in the .NET API (backend/), which is not
// reachable from the hosted Lovable preview — so these same-origin routes let the UI be explored
// with a full-access demo session. When VITE_API_URL / localhost:5080 points at the real API,
// these routes are never called.
import { catalog } from "@/lib/buildpos/modules";

export type DemoUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  approvalCap: number;
  branchId: number | null;
  branchName: string | null;
  preferredLocale: string;
  permissions: {
    module: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canExport: boolean;
  }[];
  posCeilings: Record<string, unknown>;
};

// Every page the app can navigate to, so the demo admin sees the whole product.
const EXTRA_PAGES = [
  "/dashboard", "/operate/pos-checkout", "/operate/orders", "/operate/customers", "/operate/quotations",
  "/operate/cashier-shift", "/operate/cashier-workspace", "/operate/control-tower", "/operate/approval-center",
  "/operate/customer-display", "/stock/inventory", "/stock/stocks", "/stock/branch-stock", "/stock/warehouses",
  "/stock/transfers", "/stock/movements", "/stock/expiry", "/stock/bundles", "/stock/serial-tracking",
  "/stock/stock-count", "/stock/variant-groups", "/stock/adjustments", "/suppliers/suppliers", "/suppliers/rts",
  "/finance/purchase-orders", "/finance/returns", "/finance/expenses", "/finance/pricing", "/finance/loyalty",
  "/finance/general-ledger", "/finance/tax-zatca", "/delivery/dashboard", "/delivery/pipeline", "/delivery/orders",
  "/delivery/drivers", "/delivery/vehicles", "/delivery/zones", "/delivery/logs", "/hrms/dashboard",
  "/hrms/employees", "/hrms/attendance", "/hrms/leave", "/hrms/documents", "/hrms/departments", "/hrms/logs",
  "/network/branches", "/network/terminals", "/network/devices", "/insights/kpi", "/insights/sales",
  "/insights/reports", "/insights/bi", "/admin/overview", "/admin/users", "/admin/roles", "/admin/categories",
  "/admin/rules", "/admin/settings", "/admin/pos-settings", "/admin/plans", "/admin/compliance",
  "/admin/maintenance", "/admin/audit-logs", "/admin/zatca-invoices", "/admin/zatca-settings",
];

function allPermissions() {
  const paths = new Set<string>([...catalog.map((m) => m.path), ...EXTRA_PAGES]);
  return [...paths].map((module) => ({
    module,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canExport: true,
  }));
}

const FULL_CEILINGS = {
  discountCeilingPercent: null,
  surplusReturnCeilingAmount: null,
  canAuthorizeStandardReturnWithoutReceipt: true,
  canOverrideItemPrice: true,
  canAuthorizeDamagedReturns: true,
  canVoidTransactions: true,
  canViewXReport: true,
  canViewZReport: true,
  canConfigureReturnRulesAndFees: true,
  canManagePriceListAndUsers: true,
  canManageSystemConfiguration: true,
};

// Demo accounts for the hosted preview only — no real customer data sits behind them.
// Override the password with the DEMO_ADMIN_PASSWORD env var when you want a private preview.
function demoPassword() {
  return process.env.DEMO_ADMIN_PASSWORD || "Pakistan123@";
}

const ACCOUNTS: { email: string; name: string; pin: string }[] = [
  { email: "ahmad.aziz@mytm.co", name: "Ahmad Aziz", pin: "112233" },
  { email: "owner@ecr-building.local", name: "System Admin", pin: "112233" },
];

export function findAccount(email: string) {
  return ACCOUNTS.find((a) => a.email.toLowerCase() === (email ?? "").trim().toLowerCase());
}

export function buildDemoUser(email: string): DemoUser {
  const account = findAccount(email) ?? ACCOUNTS[0];
  return {
    id: 1,
    name: account.name,
    email: account.email,
    role: "System Admin",
    approvalCap: 1_000_000,
    branchId: 1,
    branchName: "Riyadh — Main Branch",
    preferredLocale: "en",
    permissions: allPermissions(),
    posCeilings: FULL_CEILINGS,
  };
}

export const SESSION_COOKIE = "demo_session";

export function checkPassword(password: string) {
  return password === demoPassword();
}

export function checkPin(email: string, pin: string) {
  return findAccount(email)?.pin === pin;
}

export function sessionCookie(email: string) {
  const value = encodeURIComponent(email);
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

export function clearedCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSession(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

export function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
