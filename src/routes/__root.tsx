import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppLayout } from "../components/buildpos/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { FilterProvider } from "@/lib/buildpos/filter-context";
import { I18nProvider } from "@/lib/i18n";
import { AutoTranslate } from "@/lib/auto-translate";
import { AuthProvider, useAuth } from "@/lib/api/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BuildPOS — Building Materials POS Dashboard | Mi Money" },
      {
        name: "description",
        content:
          "Real-time building materials POS dashboard for KSA: sales, stock, cashier shifts, deliveries, ZATCA compliance.",
      },
      { name: "author", content: "Mi Money" },
      { property: "og:title", content: "BuildPOS — Building Materials POS Dashboard | Mi Money" },
      {
        property: "og:description",
        content:
          "Track sales, stock, cashiers, deliveries and ZATCA compliance across your KSA building material stores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "BuildPOS — Building Materials POS Dashboard | Mi Money" },
      { name: "description", content: "BuildMat Hub provides a real-time dashboard for building material retailers in KSA." },
      { property: "og:description", content: "BuildMat Hub provides a real-time dashboard for building material retailers in KSA." },
      { name: "twitter:description", content: "BuildMat Hub provides a real-time dashboard for building material retailers in KSA." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dbe3dfc8-4fb0-470e-8ad3-747475dacd04/id-preview-0b066791--1fd7f3ca-01e1-49cd-8239-80c2ab6ec0f5.lovable.app-1783002209686.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dbe3dfc8-4fb0-470e-8ad3-747475dacd04/id-preview-0b066791--1fd7f3ca-01e1-49cd-8239-80c2ab6ec0f5.lovable.app-1783002209686.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <FilterProvider>
            <AutoTranslate />
            <AuthGate />
            <Toaster position="top-right" richColors closeButton />
          </FilterProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// A tablet on a stand at the till, not a staff workstation — still requires login (same session as
// everywhere else), but renders full-screen with none of the staff sidebar/search chrome.
const FULLSCREEN_ROUTES = new Set(["/operate/customer-display"]);

function AuthGate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = pathname === "/";
  const isFullscreen = FULLSCREEN_ROUTES.has(pathname);
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user && !isPublic) {
      navigate({ to: "/" });
    }
  }, [isLoading, user, isPublic, navigate]);

  if (isPublic) return <Outlet />;

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (isFullscreen) return <Outlet />;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
