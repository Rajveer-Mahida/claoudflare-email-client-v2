import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { HonoEnv } from "../env";
import { checkPassword, createSessionToken, cookieName, cookieMaxAge } from "../auth";

export const auth = new Hono<HonoEnv>();

auth.post("/login", async (c) => {
  // Fail closed rather than signing sessions with a guessable key: without
  // both secrets set there is no safe way to issue a session at all.
  if (!c.env.AUTH_SECRET || !c.env.AUTH_PASSWORD) {
    return c.json(
      { error: "Login is not configured — set the AUTH_SECRET and AUTH_PASSWORD secrets." },
      503,
    );
  }

  const { password } = await c.req
    .json<{ password?: string }>()
    .catch(() => ({}) as { password?: string });
  if (!checkPassword(c.env, password ?? "")) {
    return c.json({ error: "Invalid password" }, 401);
  }
  const token = await createSessionToken(c.env);
  setCookie(c, cookieName(), token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: cookieMaxAge(),
    path: "/",
  });
  return c.json({ ok: true });
});

auth.post("/logout", (c) => {
  deleteCookie(c, cookieName(), { path: "/" });
  return c.json({ ok: true });
});

// Lightweight session probe for the SPA's auth gate. Reaching this at all means
// the middleware accepted the session cookie.
auth.get("/me", (c) => c.json({ ok: true }));
