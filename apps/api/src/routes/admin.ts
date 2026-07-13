import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { listUsersWithCounts, logAdminAudit } from "../db";

export const admin = new Hono<HonoEnv>();

// Gate: super-admins only (Clerk publicMetadata.role === "admin", surfaced as the
// `role` session claim and resolved to isAdmin in the index.ts auth middleware).
admin.use("/*", async (c, next) => {
  if (!c.get("isAdmin")) return c.json({ error: "forbidden" }, 403);
  return next();
});

// List every user with rollup usage counts.
admin.get("/users", async (c) => {
  await logAdminAudit(c.env.DB, c.get("userId"), null, "list-users");
  return c.json(await listUsersWithCounts(c.env.DB));
});

// Impersonation is implemented via `?owner=<userId>` on the normal data routes
// (see scope.ts). This endpoint just records that an admin opened a user's data.
admin.post("/audit", async (c) => {
  const b = await c.req
    .json<{ target?: string; action?: string }>()
    .catch(() => ({}) as { target?: string; action?: string });
  await logAdminAudit(c.env.DB, c.get("userId"), b.target ?? null, b.action ?? "view");
  return c.json({ ok: true });
});
