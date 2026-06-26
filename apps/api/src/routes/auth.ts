import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { HonoEnv } from "../env";
import { checkPassword, createSessionToken, cookieName, cookieMaxAge } from "../auth";

export const auth = new Hono<HonoEnv>();

auth.post("/login", async (c) => {
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

// Lightweight session probe for the SPA's auth gate.
auth.get("/me", (c) => c.json({ ok: true }));
