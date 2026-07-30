import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, apiPost, apiPut, ApiError, refreshSession } from "./client";

// Proactively renews the access token well before its 15-minute lifetime is up, so an active
// session extends seamlessly for as long as the 14-day refresh token stays valid — the user
// should only ever see a login screen after two real weeks of inactivity, not every 15 minutes.
const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// module is a page route key (e.g. "stock/warehouses", "admin/roles") — the same string used as
// `to` in AppLayout.tsx's nav array. Each of the 6 actions is independently grantable (a role can
// have View+Export without Edit), so this mirrors the backend's RolePermission/effective-permission
// shape exactly instead of a single ordinal level.
export type PermissionActionName = "View" | "Create" | "Edit" | "Delete" | "Approve" | "Export";
export type ModulePermission = {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
};

// Mirrors backend PosCeilingsDto (BRD §10.1 Cashier→Senior Cashier→Supervisor→Store Manager→System
// Admin ladder) — null on a decimal ceiling means "no cap".
export type PosCeilings = {
  discountCeilingPercent: number | null;
  surplusReturnCeilingAmount: number | null;
  canAuthorizeStandardReturnWithoutReceipt: boolean;
  canOverrideItemPrice: boolean;
  canAuthorizeDamagedReturns: boolean;
  canVoidTransactions: boolean;
  canViewXReport: boolean;
  canViewZReport: boolean;
  canConfigureReturnRulesAndFees: boolean;
  canManagePriceListAndUsers: boolean;
  canManageSystemConfiguration: boolean;
};

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  approvalCap: number;
  branchId: number | null;
  branchName: string | null;
  preferredLocale: string;
  permissions: ModulePermission[];
  posCeilings: PosCeilings;
};

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  // BRD §10.2 (Module 15): PIN quick-login for POS terminals — same session as password login.
  pinLogin: (email: string, pin: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  hasAccess: (module: string, action?: PermissionActionName) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function getMe(): Promise<CurrentUser | null> {
  const fetchMe = () => fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
  try {
    let res = await fetchMe();
    // A page load/reopen can land here with an already-expired 15-minute access token but a
    // still-valid 14-day refresh token — silently renew once instead of forcing a re-login. Must go
    // through the shared single-flight refreshSession(), not its own fetch: the backend revokes the
    // old refresh token the instant any caller redeems it, so this bootstrap check racing another
    // query's own 401-triggered refresh (client.ts) would otherwise have one of them lose and log a
    // perfectly valid session out.
    if (res.status === 401) {
      const refreshed = await refreshSession();
      if (refreshed) res = await fetchMe();
    }
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      try {
        return await apiPost<CurrentUser>("/api/auth/login", { email, password });
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(0, `Unable to reach the API server${API_BASE ? ` at ${API_BASE}` : ""}. Make sure the backend is running and reachable from this device.`);
      }
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const pinLoginMutation = useMutation({
    mutationFn: async ({ email, pin }: { email: string; pin: string }) => {
      try {
        return await apiPost<CurrentUser>("/api/auth/pin-login", { email, pin });
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(0, `Unable to reach the API server${API_BASE ? ` at ${API_BASE}` : ""}. Make sure the backend is running and reachable from this device.`);
      }
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiPost<void>("/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
    },
  });

  const user = meQuery.data ?? null;

  useEffect(() => {
    function handleExpired() {
      queryClient.setQueryData(["auth", "me"], null);
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [queryClient]);

  useEffect(() => {
    if (!user) return;
    // Same single-flight refreshSession() as everywhere else — a raw fetch here would race any
    // 401-triggered refresh happening at the same moment and could log the user out (see getMe above).
    const id = window.setInterval(() => {
      void refreshSession();
    }, PROACTIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      login: (email, password) => loginMutation.mutateAsync({ email, password }),
      pinLogin: (email, pin) => pinLoginMutation.mutateAsync({ email, pin }),
      logout: () => logoutMutation.mutateAsync(),
      hasAccess: (module, action = "View") => {
        const perm = user?.permissions.find((p) => p.module === module);
        if (!perm) return false;
        switch (action) {
          case "View":
            return perm.canView;
          case "Create":
            return perm.canCreate;
          case "Edit":
            return perm.canEdit;
          case "Delete":
            return perm.canDelete;
          case "Approve":
            return perm.canApprove;
          case "Export":
            return perm.canExport;
        }
      },
    }),
    [user, meQuery.isLoading, loginMutation, pinLoginMutation, logoutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Persists the display-language choice on the user's own row (see AuthController.UpdateLocale)
// instead of localStorage, so it follows the account across devices/browsers.
export function useUpdateLocale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locale: string) => apiPut<CurrentUser>("/api/auth/me/locale", { locale }),
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });
}
