import { lazy, Suspense, type ComponentType } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MailLayout } from "@/components/MailLayout";
import { EmptyDetail } from "@/components/EmptyDetail";
import { Spinner } from "@/components/primitives";
import { ErrorFallback } from "@/components/ErrorBoundary";

// Code-split the heavier leaf pages into their own chunks.
const named = <T extends Record<string, ComponentType<unknown>>>(
  loader: () => Promise<T>,
  key: keyof T,
) => lazy(() => loader().then((m) => ({ default: m[key] })));

const MailDetail = named(() => import("@/components/MailDetail"), "MailDetail");
const LoginPage = named(() => import("@/components/LoginPage"), "LoginPage");
const SettingsPage = named(() => import("@/components/SettingsPage"), "SettingsPage");
const DraftsPage = named(() => import("@/components/DraftsPage"), "DraftsPage");
const AliasesPage = named(() => import("@/components/AliasesPage"), "AliasesPage");

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid h-full w-full flex-1 place-items-center">
          <Spinner className="text-accent" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: () => (
    <Lazy>
      <LoginPage />
    </Lazy>
  ),
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AppShell,
});

const mailLayoutRoute = createRoute({
  getParentRoute: () => shellRoute,
  id: "mailLayout",
  component: MailLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => mailLayoutRoute,
  path: "/",
  component: EmptyDetail,
});

const mailRoute = createRoute({
  getParentRoute: () => mailLayoutRoute,
  path: "/mail/$id",
  component: () => (
    <Lazy>
      <MailDetail />
    </Lazy>
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: () => (
    <Lazy>
      <SettingsPage />
    </Lazy>
  ),
});

const draftsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/drafts",
  component: () => (
    <Lazy>
      <DraftsPage />
    </Lazy>
  ),
});

const aliasesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/aliases",
  component: () => (
    <Lazy>
      <AliasesPage />
    </Lazy>
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    mailLayoutRoute.addChildren([indexRoute, mailRoute]),
    settingsRoute,
    draftsRoute,
    aliasesRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  // The router catches anything thrown inside a route component, so the
  // top-level ErrorBoundary never sees those. Without this, they fall back to
  // the router's bare default error component.
  defaultErrorComponent: ({ error, reset }) => (
    <ErrorFallback error={error as Error} onRetry={reset} />
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
