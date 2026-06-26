import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MailLayout } from "@/components/MailLayout";
import { MailDetail } from "@/components/MailDetail";
import { EmptyDetail } from "@/components/EmptyDetail";
import { LoginPage } from "@/components/LoginPage";
import { SettingsPage } from "@/components/SettingsPage";
import { DraftsPage } from "@/components/DraftsPage";
import { AliasesPage } from "@/components/AliasesPage";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
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
  component: MailDetail,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: SettingsPage,
});

const draftsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/drafts",
  component: DraftsPage,
});

const aliasesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/aliases",
  component: AliasesPage,
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
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
