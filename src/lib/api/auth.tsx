import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, apiPost, apiPut, ApiError } from "./client";

// Proactively renews the access token well before its 15-minute lifetime is up, so an active
// session extends seamlessly for as long as the 14-day refresh token stays valid — the user
// should only ever see a login screen after two real weeks of inactivity, not every 15 minutes.
const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export type ModulePermission = { module: string; level: "None" | "View" | "Edit" | "Full" };

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
};

const LEVEL_RANK: Record<ModulePermission["level"], number> = { None: 0, View: 1, Edit: 2, Full: 3 };

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  hasAccess: (module: string, minLevel?: ModulePermission["level"]) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function getMe(): Promise<CurrentUser | null> {
  const fetchMe = () => fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
  try {
    let res = await fetchMe();
    // A page load/reopen can land here with an already-expired 15-minute access token but a
    // still-valid 14-day refresh token — silently renew once instead of forcing a re-login.
    if (res.status === 401) {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
      if (refreshRes.ok) res = await fetchMe();
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
        throw new ApiError(0, "Unable to reach the server.");
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
    const id = window.setInterval(() => {
      fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" }).catch(() => {});
    }, PROACTIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      login: (email, password) => loginMutation.mutateAsync({ email, password }),
      logout: () => logoutMutation.mutateAsync(),
      hasAccess: (module, minLevel = "View") => {
        const perm = user?.permissions.find((p) => p.module === module);
        return (LEVEL_RANK[perm?.level ?? "None"] ?? 0) >= LEVEL_RANK[minLevel];
      },
    }),
    [user, meQuery.isLoading, loginMutation, logoutMutation],
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
