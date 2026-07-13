import type { Context } from "hono";
import type { HonoEnv } from "./env";

/** A resolved data scope. `owner=null` means "all owners" (admin, unfiltered). */
export type Scope = { owner: string | null };

/**
 * Resolve the effective data owner for a request.
 * - Normal user: always their own userId (any ?owner= is ignored — no escalation).
 * - Admin: ?owner=<userId> scopes to that user (impersonation/support); omitted →
 *   owner=null = every user's data.
 */
export function effectiveOwner(c: Context<HonoEnv>): Scope {
  const me = c.get("userId");
  if (!c.get("isAdmin")) return { owner: me };
  const target = c.req.query("owner");
  return { owner: target ?? null };
}

/** Concrete owner for writes: admin may target ?owner=, else the caller. Never null. */
export function writeOwner(c: Context<HonoEnv>): string {
  const me = c.get("userId");
  if (c.get("isAdmin")) return c.req.query("owner") ?? me;
  return me;
}
